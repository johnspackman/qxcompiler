/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2017 Zenesis Ltd

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * John Spackman (john.spackman@zenesis.com, @johnspackman)

************************************************************************ */

require("@qooxdoo/framework");
const process = require("process");
const Gauge = require("gauge");
const fs = qx.tool.utils.Promisify.fs;
const semver = require("semver");
const path = require("upath");
const consoleControl = require("console-control-strings");

require("app-module-path").addPath(process.cwd() + "/node_modules");

require("./Command");
require("./MConfig");

/**
 * Handles compilation of the project by qxcompiler
 */
qx.Class.define("qx.tool.cli.commands.Compile", {
  extend: qx.tool.cli.commands.Command,
  include: [qx.tool.cli.commands.MConfig],

  statics: {

    YARGS_BUILDER: {
      "target": {
        alias: "t",
        describe: "Set the target type: source or build or class name. Default is first target in config file",
        requiresArg: true,
        type: "string"
      },
      "download": {
        alias: "d",
        describe: "Whether to automatically download missing libraries",
        type: "boolean",
        default: true
      },
      "output-path": {
        alias: "o",
        describe: "Base path for output",
        nargs: 1,
        requiresArg: true,
        type: "string"
      },
      "locale": {
        alias: "l",
        describe: "Compile for a given locale",
        nargs: 1,
        requiresArg: true,
        type: "string",
        array: true
      },
      "update-po-files": {
        alias: "u",
        describe: "enables detection of translations and writing them out into .po files",
        type: "boolean",
        default: false
      },
      "write-all-translations": {
        describe: "enables output of all translations, not just those that are explicitly referenced",
        type: "boolean"
      },
      "set": {
        describe: "sets an environment value",
        nargs: 1,
        requiresArg: true,
        type: "string",
        array: true
      },
      "app-class": {
        describe: "sets the application class",
        nargs: 1,
        requiresArg: true,
        type: "string"
      },
      "app-theme": {
        describe: "sets the theme class for the current application",
        nargs: 1,
        requiresArg: true,
        type: "string"
      },
      "app-name": {
        describe: "sets the name of the current application",
        nargs: 1,
        requiresArg: true,
        type: "string"
      },
      "library": {
        describe: "adds a library",
        nargs: 1,
        requiresArg: true,
        type: "string",
        array: true
      },
      "watch": {
        describe: "enables watching for changes and continuous compilation",
        type: "boolean",
        alias: "w"
      },
      "machine-readable": {
        alias: "M",
        describe: "output compiler messages in machine-readable format",
        type: "boolean"
      },
      "verbose": {
        alias: "v",
        describe: "enables additional progress output to console",
        type: "boolean"
      },
      "minify": {
        alias: "m",
        describe: "disables minification (for build targets only)",
        choices: [ "off", "minify", "mangle", "beautify" ],
        default: "mangle"
      },
      "save-unminified": {
        alias: "u",
        describe: "Saves a copy of the unminified version of output files (build target only)",
        type: "boolean",
        default: false
      },
      "erase": {
        alias: "e",
        describe: "Enabled automatic deletion of the output directory when compiler version changes",
        type: "boolean",
        default: true
      },
      "feedback": {
        describe: "Shows gas-gauge feedback",
        type: "boolean",
        default: null,
        alias: "f"
      },
      "typescript": {
        alias: "T",
        describe: "Outputs typescript definitions in qooxdoo.d.ts",
        type: "boolean"
      },
      "add-created-at": {
        alias: "C",
        describe: "Adds code to populate object's $$createdAt",
        type: "boolean"
      },
      "clean": {
        alias: "c",
        describe: "Deletes the target dir before compile",
        type: "boolean"
      },
      "warnAsError": {
        alias: "e",
        default: false,
        describe: "Handle compiler warnings as error"
      },
      "write-library-info": {
        alias: "I",
        describe: "Write library information to the script, for reflection",
        type: "boolean",
        default: true
      },
      "bundling": {
        alias: "b",
        describe: "Whether bundling is enabled",
        type: "boolean",
        default: true
      },
      "force": {
        describe: "Override warnings",
        type: "boolean",
        default: false,
        alias: "F"
      }
    },

    getYargsCommand: function() {
      return {
        command   : "compile [configFile]",
        describe  : "compiles the current application, using compile.json",
        builder   : qx.tool.cli.commands.Compile.YARGS_BUILDER,
        handler: function(argv) {
          return new qx.tool.cli.commands.Compile(argv)
            .process()
            .catch(e => {
              qx.tool.compiler.Console.error("Error: " + (e.stack || e.message));
              process.exit(1);
            });
        }
      };
    }

  },

  events: {

    /*** fired when application writing starts */
    "writingApplications": "qx.event.type.Event",
    /** fired when writing of single application starts
     *  data: app {Application}
     */
    "writingApplication": "qx.event.type.Data",
    /** fired when writing of single application is written
     *  data: app {Application}
     */
    "writtenApplication": "qx.event.type.Data",
    /*** fired after writing of all applications */
    "writtenApplications" :"qx.event.type.Event",

    /**
     * Fired when a class is about to be compiled; data is a map:
     *
     * dbClassInfo: {Object} the newly populated class info
     * oldDbClassInfo: {Object} the previous populated class info
     * classFile - {ClassFile} the qx.tool.compiler.ClassFile instance
     */
    "compilingClass": "qx.event.type.Data",

    /**
     * Fired when a class is compiled; data is a map:
     * dbClassInfo: {Object} the newly populated class info
     * oldDbClassInfo: {Object} the previous populated class info
     * classFile - {ClassFile} the qx.tool.compiler.ClassFile instance
     */
    "compiledClass": "qx.event.type.Data",

    /**
     * Fired when the database is been saved
     * database: {Object} the database to save
     */
    "saveDatabase": "qx.event.type.Data",

    /**
     * Fired after all enviroment data is collected
     *  application {qx.tool.compiler.app.Application} the app
     *  enviroment: {Object} enviroment data
     */
    "checkEnvironment": "qx.event.type.Data",

    /**
     * Fired when making of apps begins
    */
    "making": "qx.event.type.Event",

    /**
     * Fired when making of apps is done.
    */
    "made": "qx.event.type.Event"

  },


  members: {
    __gauge: null,
    __makers: null,
    __config: null,
    __libraries: null,

    /*
     * @Override
     */
    process: async function() {
      // check if we need to migrate files
      await (new qx.tool.cli.commands.package.Migrate(this.argv)).process(true);

      let configDb = await qx.tool.cli.ConfigDb.getInstance();
      if (this.argv["feedback"] === null) {
        this.argv["feedback"] = configDb.db("qx.default.feedback", true);
      }
            
      if (this.argv["machine-readable"]) {
        qx.tool.compiler.Console.getInstance().setMachineReadable(true);
      } else {
        let configDb = await qx.tool.cli.ConfigDb.getInstance();
        let color = configDb.db("qx.default.color", null);
        if (color) {
          let colorOn = consoleControl.color(color.split(" "));
          process.stdout.write(colorOn + consoleControl.eraseLine());
          let colorReset = consoleControl.color("reset");
          process.on("exit", () => process.stdout.write(colorReset + consoleControl.eraseLine()));
          let Console = qx.tool.compiler.Console.getInstance();
          Console.setColorOn(colorOn);
        }
        
        if (this.argv["feedback"]) {
          var themes = require("gauge/themes");
          var ourTheme = themes.newTheme(themes({hasUnicode: true, hasColor: true}));
          let colorOn = qx.tool.compiler.Console.getInstance().getColorOn();
          ourTheme.preProgressbar = colorOn + ourTheme.preProgressbar;
          ourTheme.preSubsection = colorOn + ourTheme.preSubsection;
          ourTheme.progressbarTheme.postComplete += colorOn;
          ourTheme.progressbarTheme.postRemaining += colorOn;
       
          this.__gauge = new Gauge();
          this.__gauge.setTheme(ourTheme);
          this.__gauge.show("Compiling", 0);
          const TYPES = {
            "error": "ERROR",
            "warning": "Warning"
          };
          qx.tool.compiler.Console.getInstance().setWriter((str, msgId) => {
            msgId = qx.tool.compiler.Console.MESSAGE_IDS[msgId];
            if (msgId.type !== "message") {
              this.__gauge.hide();
              qx.tool.compiler.Console.log(colorOn + TYPES[msgId.type] + ": " + str);
              this.__gauge.show();
            } else {
              this.__gauge.show(colorOn + str);
            }
          });
        }
      }

      if (this.__gauge) {
        this.addListener("writingApplications", () => this.__gauge.show("Writing Applications", 0));
        this.addListener("writtenApplications", () => this.__gauge.show("Writing Applications", 1));
        this.addListener("writingApplication", evt => this.__gauge.pulse("Writing Application " + evt.getData().getName()));
        this.addListener("compilingClass", evt => this.__gauge.pulse("Compiling " + evt.getData().classFile.getClassName()));
        this.addListener("minifyingApplication", evt => this.__gauge.pulse("Minifying " + evt.getData().application.getName() + " " + evt.getData().filename));
      } else {
        this.addListener("writingApplication", evt => qx.tool.compiler.Console.print("qx.tool.cli.compile.writingApplication", evt.getData().getName()));
        this.addListener("minifyingApplication", evt => qx.tool.compiler.Console.print("qx.tool.cli.compile.minifyingApplication", evt.getData().application.getName(), evt.getData().filename));
        if (this.argv.verbose) {
          var startTimes = {};
          this.addListener("compilingClass", evt => {
            var classname = evt.getData().classFile.getClassName();
            startTimes[classname] = new Date();
            qx.tool.compiler.Console.print("qx.tool.cli.compile.compilingClass", classname);
          });
          this.addListener("compiledClass", evt => {
            var classname = evt.getData().classFile.getClassName();
            var startTime = startTimes[classname];
            var endTime = new Date();
            var diff = endTime.getTime() - startTime.getTime();
            qx.tool.compiler.Console.print("qx.tool.cli.compile.compiledClass", classname, qx.tool.utils.Utils.formatTime(diff));
          });
        }
      }
      
      var config = this.__config = await this.parse(this.argv);
      if (!config) {
        throw new qx.tool.utils.Utils.UserError("Error: Cannot find any configuration");
      }
      var makers = this.__makers = await this.createMakersFromConfig(config);
      if (!makers || !makers.length) {
        throw new qx.tool.utils.Utils.UserError("Error: Cannot find anything to make");
      }
      
      this.addListener("writtenApplications", e => {
        if (this.argv.verbose) {
          qx.tool.compiler.Console.log("\nCompleted all applications, libraries used are:");
          Object.values(this.__libraries).forEach(lib => qx.tool.compiler.Console.log(`   ${lib.getNamespace()} (${lib.getRootDir()})`));
        }
      });
      
      let countMaking = 0;
      const collateDispatchEvent = evt => {
        if (countMaking == 1) {
          this.dispatchEvent(evt.clone());
        }
      };
      
      await qx.Promise.all(makers.map(async maker => {
        var analyser = maker.getAnalyser();
        let cfg = await qx.tool.cli.ConfigDb.getInstance();
        analyser.setWritePoLineNumbers(cfg.db("qx.translation.strictPoCompatibility", false));

        if (this.argv["clean"]) {
          await maker.eraseOutputDir();
          await qx.tool.utils.files.Utils.safeUnlink(analyser.getDbFilename());
          await qx.tool.utils.files.Utils.safeUnlink(analyser.getResDbFilename());
        }
        if (config.ignores) {
          analyser.setIgnores(config.ignores);
        }
        
        var target = maker.getTarget();
        maker.addListener("writingApplications", collateDispatchEvent);
        maker.addListener("writtenApplications", collateDispatchEvent);
        maker.addListener("writingApplication", e => this.dispatchEvent(e.clone()));
        maker.addListener("writtenApplication", e => this.dispatchEvent(e.clone()));
        analyser.addListener("compilingClass", e => this.dispatchEvent(e.clone()));
        analyser.addListener("compiledClass", e => this.dispatchEvent(e.clone()));
        analyser.addListener("saveDatabase", e => this.dispatchEvent(e.clone()));
        target.addListener("checkEnvironment", e => this.dispatchEvent(e.clone()));
        target.addListener("minifyingApplication", e => this.dispatchEvent(e.clone()));

        var p = qx.tool.utils.files.Utils.safeStat("source/index.html")
          .then(stat => stat && qx.tool.compiler.Console.print("qx.tool.cli.compile.legacyFiles", "source/index.html"));

        // Simple one of make
        if (!this.argv.watch) {
          maker.addListener("making", () => {
            countMaking++;
            if (countMaking == 1) {
              this.fireEvent("making");
            }
          });
          maker.addListener("made", () => {
            countMaking--;
            if (countMaking == 0) {
              this.fireEvent("made");
            }
          });
          
          return p.then(() => maker.make());
        }
        
        // Continuous make
        let watch = new qx.tool.cli.Watch(maker);
        
        watch.addListener("making", () => {
          countMaking++;
          if (countMaking == 1) {
            this.fireEvent("making");
          }
        });
        watch.addListener("made", () => {
          countMaking--;
          if (countMaking == 0) {
            this.fireEvent("made");
          }
        });
        
        return p.then(() => watch.start());
      }));
      
      this.addListener("making", evt => {
        if (this.__gauge) {
          this.__gauge.show("Compiling", 1);
        } else {
          qx.tool.compiler.Console.print("qx.tool.cli.compile.makeBegins");
        }
      });
      
      this.addListener("made", evt => {
        if (this.__gauge) {
          this.__gauge.show("Compiling", 1);
        } else {
          qx.tool.compiler.Console.print("qx.tool.cli.compile.makeEnds");
        }
      });
    },


    /**
     * Processes the configuration from a JSON data structure and creates a Maker
     *
     * @param data {Map}
     * @return {Maker}
     */
    createMakersFromConfig: async function(data) {
      const Console = qx.tool.compiler.Console.getInstance();
      var t = this;
      
      var argvAppNames = null;
      if (t.argv["app-name"]) {
        argvAppNames = t.argv["app-name"].split(",");
      }
      
      
      /*
       * Calculate the the list of targets and applications; this is a many to many list, where an 
       * application can be compiled for many targets, and each target has many applications.
       * 
       * Each target configuration is updated to have `appConfigs[]` and each application configuration
       * is updated to have `targetConfigs[]`.
       */
      data.targets.forEach((targetConfig, index) => targetConfig.index = index);
      let targetConfigs = [];
      let defaultTargetConfig = null;
      data.targets.forEach(targetConfig => {
        if (targetConfig.type === data.targetType) {
          if (!targetConfig["application-names"] && !targetConfig["application-types"]) {
            if (defaultTargetConfig) {
              qx.tool.compiler.Console.print("qx.tool.cli.compile.multipleDefaultTargets");
            } else {
              defaultTargetConfig = targetConfig;
            }
          } else {
            targetConfigs.push(targetConfig);
          }
        }
      });
      
      data.applications.forEach((appConfig, index) => {
        appConfig.index = index;
        let appType = appConfig.type||"browser";
        let appTargetConfigs = targetConfigs.filter(targetConfig => {
          let appTypes = targetConfig["application-types"];
          if (appTypes && !qx.lang.Array.contains(appTypes, appType)) {
            return false;
          }
          
          let appNames = targetConfig["application-names"];
          if (appConfig.name && appNames && !qx.lang.Array.contains(appNames, appConfig.name)) {
            return false;
          }
          if (appConfig.name && argvAppNames && !qx.lang.Array.contains(argvAppNames, appConfig.name)) {
            return false;
          }
          return true;
        });
        
        if (appTargetConfigs.length == 0) {
          if (defaultTargetConfig) {
            appTargetConfigs = [defaultTargetConfig];
          } else {
            throw new qx.tool.utils.Utils.UserError(`Cannot find any suitable targets for application #${index} (named ${appConfig.name||"unnamed"})`);
          }
        }
        
        appTargetConfigs.forEach(targetConfig => {
          if (!targetConfig.appConfigs) {
            targetConfig.appConfigs = [];
          }
          targetConfig.appConfigs.push(appConfig);
          if (!appConfig.targetConfigs) {
            appConfig.targetConfigs = [];
          }
          appConfig.targetConfigs.push(targetConfig);
        });
      });
      if (defaultTargetConfig.appConfigs) {
        targetConfigs.push(defaultTargetConfig);
      }
      
      
      /*
       * Locate and load libraries
       */
      if (!data.libraries.every(libData => fs.existsSync(libData + "/Manifest.json"))) {
        Console.log("One or more libraries not found - trying to install them from library repository...");
        const installer = new qx.tool.cli.commands.package.Install({
          quiet: true,
          save: false
        });
        await installer.process();
      }
      
      let libraries = this.__libraries = {};
      await qx.Promise.all(data.libraries.map(async libPath => {
        var library = await new qx.tool.compiler.app.Library.createLibrary(libPath);
        libraries[library.getNamespace()] = library;
      }));
      
      // Search for Qooxdoo library if not already provided
      var qxLib = libraries["qx"];
      if (!qxLib) {
        var library = await new qx.tool.compiler.app.Library.createLibrary(await this.getGlobalQxPath());
        libraries[library.getNamespace()] = library;
        qxLib = libraries["qx"];
      }
      if (this.argv.verbose) {
        Console.log("QooxDoo found in " + qxLib.getRootDir());
      }
      let errors = await this.__checkDependencies(Object.values(libraries), data.packages);
      if (errors.length > 0) {
        if (this.argv.warnAsError) {
          throw new qx.tool.utils.Utils.UserError(errors.join("\n"));
        } else {
          qx.tool.compiler.Console.log(errors.join("\n"));
        }
      }
      
      
      /*
       * Figure out which will be the default application; this will need some work for situations
       * where there are multiple browser based targets
       */
      let hasExplicitDefaultApp = false;
      let defaultAppConfig = null;
      targetConfigs.forEach(targetConfig => {
        if (targetConfigs.appConfigs) {
          targetConfig.appConfigs.forEach(appConfig => {
            if (appConfig.type && appConfig.type != "browser") {
              return;
            }
            
            let setDefault;
            if (appConfig.writeIndexHtmlToRoot !== undefined) {
              qx.tool.compiler.Console.print("qx.tool.cli.compile.deprecatedCompileSeeOther", "application.writeIndexHtmlToRoot", "application.default");
              setDefault = appConfig.writeIndexHtmlToRoot;
            } else if (appConfig["default"] !== undefined) {
              setDefault = appConfig["default"];
            }

            if (setDefault !== undefined) {
              if (setDefault) {
                if (hasExplicitDefaultApp) {
                  throw new qx.tool.utils.Utils.UserError("Error: Can only set one application to be the default application!");
                }
                hasExplicitDefaultApp = true;
                defaultAppConfig = appConfig;
              }
            } else if (!defaultAppConfig) {
              defaultAppConfig = appConfig;
            }
          });
        }
      });
      
      
      /*
       * There is still only one target per maker, so convert our list of targetConfigs into an array of makers 
       */
      let makers = [];
      targetConfigs.forEach(targetConfig => {
        if (!targetConfig.appConfigs) {
          qx.tool.compiler.Console.print("qx.tool.cli.compile.unusedTarget", target.type, target.index);
          return;
        }
        
        var outputPath = targetConfig.outputPath;
        if (!outputPath) {
          throw new qx.tool.utils.Utils.UserError("Missing output-path for target " + targetConfig.type);
        }

        var maker = new qx.tool.compiler.makers.AppMaker();
        if (!this.argv["erase"]) {
          maker.setNoErase(true);
        }

        var targetClass = targetConfig.targetClass ? this.resolveTargetClass(targetConfig.targetClass): null;
        if (!targetClass && targetConfig.type) {
          targetClass = this.resolveTargetClass(targetConfig.type);
        }
        if (!targetClass) {
          throw new qx.tool.utils.Utils.UserError("Cannot find target class: " + (targetConfig.targetClass||targetConfig.type));
        }
        /* eslint-disable new-cap */
        var target = new targetClass(outputPath);
        /* eslint-enable new-cap */
        if (targetConfig.uri) {
          qx.tool.compiler.Console.print("qx.tool.cli.compile.deprecatedUri", "target.uri", targetConfig.uri);
        }
        if (targetConfig.writeCompileInfo) {
          target.setWriteCompileInfo(true);
        }
        target.setWriteLibraryInfo(this.argv.writeLibraryInfo);
        target.setUpdatePoFiles(this.argv.updatePoFiles);
        
        // Take the command line for `minify` as most precedent only if provided
        var minify;
        if ((process.argv.indexOf("--minify") > -1)) {
          minify = t.argv["minify"];
        }
        minify = minify || targetConfig["minify"] || t.argv["minify"];
        if (typeof minify == "boolean") {
          minify = minify ? "minify" : "off";
        }
        if (!minify) {
          minify = "mangle";
        }
        if (typeof target.setMinify == "function") {
          target.setMinify(minify);
        }
        var saveUnminified = targetConfig["save-unminified"] || t.argv["save-unminified"];
        if (typeof saveUnminified == "boolean" && typeof target.setSaveUnminified == "function") {
          target.setSaveUnminified(saveUnminified);
        }
        
        maker.setTarget(target);

        maker.setLocales(data.locales||[ "en" ]);
        if (data.writeAllTranslations) {
          maker.setWriteAllTranslations(data.writeAllTranslations);
        }

        if (typeof targetConfig.typescript == "string") {
          maker.set({ outputTypescript: true, outputTypescriptTo: targetConfig.typescript });
        } else if (typeof targetConfig.typescript == "boolean") {
          maker.set({ outputTypescript: true });
        }
        if (this.argv["typescript"]) {
          maker.set({ outputTypescript: true });
        }

        if (data.environment) {
          maker.setEnvironment(data.environment);
        }
        if (targetConfig.environment) {
          target.setEnvironment(targetConfig.environment);
        }

        if (data["path-mappings"]) {
          for (var from in data["path-mappings"]) {
            var to = data["path-mappings"][from];
            target.addPathMapping(from, to);
          }
        }

        function mergeArray(dest, ...srcs) {
          srcs.forEach(function(src) {
            if (src) {
              src.forEach(function(elem) {
                if (!qx.lang.Array.contains(dest, src)) {
                  dest.push(elem);
                }
              });
            }
          });
          return dest;
        }
        let babelOptions = data.babelOptions || {};
        qx.lang.Object.mergeWith(babelOptions, targetConfig.babelOptions || {});
        maker.getAnalyser().setBabelOptions(babelOptions);

        var addCreatedAt = targetConfig["addCreatedAt"] || t.argv["addCreatedAt"];
        if (addCreatedAt) {
          maker.getAnalyser().setAddCreatedAt(true);
        }

        for (let ns in libraries) {
          maker.getAnalyser().addLibrary(libraries[ns]);
        }
        
        
        let allApplicationTypes = {};
        targetConfig.appConfigs.forEach(appConfig => {
          var app = appConfig.app = new qx.tool.compiler.app.Application(appConfig["class"]);
          app.setTemplatePath(t.getTemplateDir());

          [ "type", "theme", "name", "environment", "outputPath", "bootPath", "loaderTemplate"].forEach(name => {
            if (appConfig[name] !== undefined) {
              var fname = "set" + qx.lang.String.firstUp(name);
              app[fname](appConfig[name]);
            }
          });
          allApplicationTypes[app.getType()] = true;
          if (appConfig.uri) {
            qx.tool.compiler.Console.print("qx.tool.cli.compile.deprecatedUri", "application.uri", appConfig.uri);
          }
          if (appConfig.title) {
            app.setTitle(appConfig.title);
          }
          
          var parts = appConfig.parts || targetConfig.parts || data.parts;
          if (parts) {
            if (!parts.boot) {
              throw new qx.tool.utils.Utils.UserError("Cannot determine a boot part for application " + (appConfig.index + 1) + " " + (appConfig.name||""));
            }
            for (var partName in parts) {
              var partData = parts[partName];
              var include = typeof partData.include == "string" ? [ partData.include ] : partData.include;
              var exclude = typeof partData.exclude == "string" ? [ partData.exclude ] : partData.exclude;
              var part = new qx.tool.compiler.app.Part(partName, include, exclude).set({
                combine: Boolean(partData.combine),
                minify: Boolean(partData.minify)
              });
              app.addPart(part);
            }
          }

          if (target.getType() == "source" && t.argv.bundling) {
            var bundle = appConfig.bundle || targetConfig.bundle || data.bundle;
            if (bundle) {
              if (bundle.include) {
                app.setBundleInclude(bundle.include);
              }
              if (bundle.exclude) {
                app.setBundleExclude(bundle.exclude);
              }
            }
          }

          app.set({
            exclude: mergeArray([], data.exclude, targetConfig.exclude, appConfig.exclude),
            include: mergeArray([], data.include, targetConfig.include, appConfig.include)
          });
          maker.addApplication(app);
        });
        
        const CF = qx.tool.compiler.ClassFile;
        let globalSymbols = [];
        qx.lang.Array.append(globalSymbols, CF.QX_GLOBALS);
        qx.lang.Array.append(globalSymbols, CF.COMMON_GLOBALS);
        if (allApplicationTypes["browser"]) {
          qx.lang.Array.append(globalSymbols, CF.BROWSER_GLOBALS);
        }
        if (allApplicationTypes["node"]) {
          qx.lang.Array.append(globalSymbols, CF.NODE_GLOBALS);
        }
        if (allApplicationTypes["rhino"]) {
          qx.lang.Array.append(globalSymbols, CF.RHINO_GLOBALS);
        }
        maker.getAnalyser().setGlobalSymbols(globalSymbols);

        if (defaultAppConfig) {
          defaultAppConfig.app.setWriteIndexHtmlToRoot(true);
        } else {
          qx.tool.utils.files.Utils.safeUnlink(target.getOutputDir() + target.getScriptPrefix() + "index.html");
        }

        // Note - this will cause output multiple times, once per maker/target; but this is largely unavoidable
        //  because different targets can cause different warnings for the same code due to different compilation
        //  options (eg node vs browser)
        maker.getAnalyser().addListener("compiledClass", function(evt) {
          var data = evt.getData();
          var markers = data.dbClassInfo.markers;
          if (markers) {
            markers.forEach(function(marker) {
              var str = qx.tool.compiler.Console.decodeMarker(marker);
              Console.warn(data.classFile.getClassName() + ": " + str);
            });
          }
        });
        
        makers.push(maker);
      });
      
      return makers;
    },

    /**
     * Checks the dependencies of the current library
     * @param  {qx.tool.compiler.app.Library[]} libs
     *    The list of libraries to check
     * @param {Object|*} packages
     *    If given, an object mapping library uris to library paths
     * @return {Promise<Array>} Array of error messages
     * @private
     */
    async __checkDependencies(libs, packages) {
      const Console = qx.tool.compiler.Console.getInstance();
      let errors = [];
      const SDK_VERSION = await this.getUserQxVersion();
      // check all requires
      for (let lib of libs) {
        let requires = lib.getRequires();
        if (!requires) {
          requires = {};
        }
        if (!packages) {
          packages = {};
        }
        // check for qooxdoo-range
        let range = lib.getLibraryInfo()["qooxdoo-range"];
        if (range) {
          if (this.argv.verbose) {
            Console.warn(`${lib.getNamespace()}: The configuration setting "qooxdoo-range" in Manifest.json has been deprecated in favor of "requires.@qooxdoo/framework".`);
          }
          if (!requires["@qooxdoo/framework"]) {
            requires["@qooxdoo/framework"] = range;
          }
        }
        let requires_uris = Object.getOwnPropertyNames(requires).filter(name => !name.startsWith("qooxdoo-") && name !== "@qooxdoo/framework" && name !== "@qooxdoo/compiler");
        let pkg_libs = Object.getOwnPropertyNames(packages);
        if (requires_uris.length > 0 && pkg_libs.length === 0) {
          // if we don't have package data
          if (this.argv.download) {
            // but we're instructed to download the libraries
            if (this.argv.verbose) {
              Console.info(`>>> Installing latest compatible version of required libraries...`);
            }
            const installer = new qx.tool.cli.commands.package.Install({
              verbose: this.argv.verbose,
              save: false // save to lockfile only, not to manifest
            });
            await installer.process();
            throw new qx.tool.utils.Utils.UserError("Added missing library information from Manifest. Please restart the compilation.");
          } else {
            throw new qx.tool.utils.Utils.UserError("No library information available. Try 'qx compile --download'");
          }
        }

        for (let reqUri of Object.getOwnPropertyNames(requires)) {
          let requiredRange = requires[reqUri];
          switch (reqUri) {
            // npm release only
            case "qooxdoo-compiler":
            case "@qooxdoo/compiler": {
              let compilerVersion = qx.tool.compiler.Version.VERSION;
              let satifiesRange = semver.satisfies(compilerVersion, requiredRange, {loose: true, includePrerelease: true}) ||
                  (Number(semver.major(compilerVersion)) === 0 && semver.gtr(compilerVersion, requiredRange, true));
              if (!satifiesRange) {
                errors.push(`${lib.getNamespace()}: Needs @qooxdoo/compiler version ${requiredRange}, found ${compilerVersion}`);
              }
              break;
            }
            // npm release only
            case "qooxdoo-sdk":
            case "@qooxdoo/framework": {
              let qxVersion = SDK_VERSION;
              if (!semver.satisfies(qxVersion, requiredRange, {loose: true})) {
                errors.push(`${lib.getNamespace()}: Needs @qooxdoo/framework version ${requiredRange}, found ${qxVersion}`);
              }
              break;
            }
            // github repository release or commit-ish identifier
            default: {
              let l = libs.find(entry => path.relative("", entry.getRootDir()) === packages[reqUri]);
              if (!l) {
                errors.push(`${lib.getNamespace()}: Cannot find required library '${reqUri}'`);
                break;
              }
              // github release of a package
              let libVersion = l.getLibraryInfo().version;
              if (!semver.valid(libVersion, {loose: true})) {
                Console.warn(`${reqUri}: Version is not valid: ${libVersion}`);
              } else if (!semver.satisfies(libVersion, requiredRange, {loose: true})) {
                errors.push(`${lib.getNamespace()}: Needs ${reqUri} version ${requiredRange}, found ${libVersion}`);
              }
              break;
            }
          }
        }
      }
      return errors;
    },

    /**
     * Resolves the target class instance from the type name; accepts "source" or "build" or
     * a class name
     * @param type {String}
     * @returns {Maker}
     */
    resolveTargetClass: function(type) {
      if (!type) {
        return null;
      }
      if (type.$$type == "Class") {
        return type;
      }
      if (type == "build") {
        return qx.tool.compiler.targets.BuildTarget;
      }
      if (type == "source") {
        return qx.tool.compiler.targets.SourceTarget;
      }
      if (type == "typescript") {
        throw new qx.tool.utils.Utils.UserError("Typescript targets are no longer supported - please use `typescript: true` in source target instead");
      }
      if (type) {
        var targetClass;
        if (type.indexOf(".") < 0) {
          targetClass = qx.Class.getByName("qx.tool.compiler.targets." + type);
        } else {
          targetClass = qx.Class.getByName(type);
        }
        return targetClass;
      }
      return null;
    },

    /**
     * Returns the list of makers to make
     * 
     * @return  {Maker[]}
     */
    getMakers() {
      return this.__makers;
    },
    
    /**
     * Returns the one maker; this is for backwards compatibility with the compiler API, because it is
     * possible to define multiple targets and therefore have multiple makers.  This method will return
     * the one maker, when there is only one maker defined (ie one target), which is fine for any existing
     * configurations.
     * 
     * @deprected
     * @return {Maker}
     */
    getMaker() {
      if (this.__makers.length == 1) {
        return this.__makers[0];
      }
      throw new Error("Cannot get a single maker - there are " + this.__makers.length + " available"); 
    },
    
    /**
     * Returns the makers for a given application name
     * 
     * @param appName {String} the name of the application
     * @return {Maker}
     */
    getMakersForApp(appName) {
      return this.__makers.filter(maker => maker.getApplication().getName() == appName);
    },

    /**
     * Returns the configuration object being compiled
     */
    _getConfig() {
      return this.__config;
    },
    
    /**
     * Returns a list of libraries which are used
     * 
     * @return {Library[]}
     */
    getLibraries() {
      return this.__libraries; 
    }
  },

  defer: function(statics) {
    qx.tool.compiler.Console.addMessageIds({
      "qx.tool.cli.compile.writingApplication": "Writing application %1",
      "qx.tool.cli.compile.minifyingApplication": "Minifying %1 %2",
      "qx.tool.cli.compile.compilingClass": "Compiling class %1",
      "qx.tool.cli.compile.compiledClass": "Compiled class %1 in %2s",
      "qx.tool.cli.compile.makeBegins": "Making applications...",
      "qx.tool.cli.compile.makeEnds": "Applications are made"
    });
    qx.tool.compiler.Console.addMessageIds({
      "qx.tool.cli.compile.legacyFiles": "File %1 exists but is no longer used",
      "qx.tool.cli.compile.deprecatedCompile": "The configuration setting %1 in compile.json is deprecated",
      "qx.tool.cli.compile.deprecatedCompileSeeOther": "The configuration setting %1 in compile.json is deprecated (see %2)",
      "qx.tool.cli.compile.deprecatedUri": "URIs are no longer set in compile.json, the configuration setting %1=%2 in compile.json is ignored (it's auto detected)",
      "qx.tool.cli.compile.deprecatedProvidesBoot": "Manifest.Json no longer supports provides.boot - only Applications can have boot; specified in %1"
    }, "warning");
  }
});
