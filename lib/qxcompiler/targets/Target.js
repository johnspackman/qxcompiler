/* ************************************************************************
 *
 *    qxcompiler - node.js based replacement for the Qooxdoo python
 *    toolchain
 *
 *    https://github.com/qooxdoo/qxcompiler
 *
 *    Copyright:
 *      2011-2017 Zenesis Limited, http://www.zenesis.com
 *
 *    License:
 *      MIT: https://opensource.org/licenses/MIT
 *
 *      This software is provided under the same licensing terms as Qooxdoo,
 *      please see the LICENSE file in the Qooxdoo project's top-level directory
 *      for details.
 *
 *    Authors:
 *      * John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 * ************************************************************************/

var fs = require("fs");
var qx = require("qooxdoo");
var async = require("async");
var util = require("../../util");
var path = require("path");

var log = util.createLog("target");

const stat = util.promisify(fs.stat);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

/**
 * A target for building an application, instances of Target control the generation of transpiled
 * source and collection into an application, including minifying etc
 */
module.exports = qx.Class.define("qxcompiler.targets.Target", {
  extend: qx.core.Object,

  /**
   * Constructor
   * @param outputDir {String} output directory
   */
  construct: function(outputDir) {
    this.base(arguments);
    this.__libraryUris = {};
    this.setOutputDir(outputDir);
  },

  properties: {
    /** Type of compilation */
    type: {
      init: "source",
      nullable: false,
      check: [ "source", "build" ]
    },

    /** Output directory (guaranteed to have a trailing slash) */
    outputDir: {
      init: "output",
      nullable: false,
      check: "String",
      transform: "_transformOutputDir"
    },
    
    /** 
     * URI to get to the resources generated (eg the resources/ and transpiled/ directories); the default 
     * is relative to the application folder
     */
    targetUri: {
      init: null,
      nullable: true,
      check: "String"
    },

    /**
     * Prefix for all scripts and generated files; this is used to allow multiple
     * applications to be generated into a single output folder, EG for the demo browser
     */
    scriptPrefix: {
      init: "",
      check: "String"
    },

    /**
     * Whether to generate the index.html
     */
    generateIndexHtml: {
      init: true,
      check: "Boolean"
    },

    /**
     * Environment property map
     */
    environment: {
      init: null,
      nullable: true
    },

    /**
     * The analyser being generated
     */
    analyser: {
      nullable: false
    },

    /** Locales being generated */
    locales: {
      nullable: false,
      init: [ "en" ]
    },

    /** Whether to write all translation strings (as opposed to just those used by the classes) */
    writeAllTranslations: {
      init: false,
      nullable: false,
      check: "Boolean"
    },
    
    /** Whether to write a summary of the compile info to disk, ie everything about dependencies and 
     * resources that are used to create the boot.js file, but stored as pure JSON for third party code
     * to use.
     */
    writeCompileInfo: {
      init: false,
      nullable: false,
      check: "Boolean"
    }

  },

  members: {
    __libraryUris: null,

    /**
     * Initialises the target, creating directories etc
     * @param cb
     */
    open: function(cb) {
      cb();
    },

    /**
     * Transforms outputDir so that it always includes a trailing slash
     * @param value
     * @returns {*}
     * @private
     */
    _transformOutputDir: function(value) {
      if (value) {
        if (value[value.length - 1] != '/')
          value += "/";
      }
      return value;
    },

    /**
     * Compiles the environment settings into one
     * @param app
     * @param environment
     * @returns {{}}
     * @private
     */
    _mergeEnvironment: function(app, environment) {
      function merge(obj) {
        if (obj)
          for (var name in obj)
            result[name] = obj[name];
      }
      var result = {};
      if (environment)
        merge(environment);
      if (app.getEnvironment())
        merge(app.getEnvironment());
      return result;
    },

    /**
     * Syncs all assets into the output directory
     * @param compileInfo
     * @param cb
     * @private
     */
    _syncAssets: function(compileInfo, cb) {
      var t = this;
      
      var libraries = this.getAnalyser().getLibraries();
      var libraryLookup = {};
      libraries.forEach(function(library) {
        libraryLookup[library.getNamespace()] = library;
      });

      var queue = async.queue(
          function (asset, cb) {
            var library = libraryLookup[asset.libraryName];
            qxcompiler.files.Utils.sync(
                library.getRootDir() + "/" + library.getResourcePath() + "/" + asset.filename,
                path.join(t.getOutputDir(), "resource", asset.filename))
                .then(() => cb()).catch((err) => cb(err));
          },
          100
      );
      queue.drain = cb;
      queue.error = function(err) {
        t.error(err.stack||err);
      };
      queue.push(compileInfo.assets);
    },
    
    /**
     * Returns the root for applications
     */
    getApplicationRoot: function(application) {
      return path.join(this.getOutputDir(), application.getOutputPath() || application.getName()) + "/";
    },
    
    /**
     * Returns the URI for the root of the output, relative to the application
     */
    _getOutputRootUri: function(application) {
      var targetUri = this.getTargetUri();
      if (!targetUri) {
        var dir = this.getApplicationRoot(application);
        var targetUri = path.relative(dir, this.getOutputDir()) + "/";
      } else if (targetUri[targetUri.length - 1] != '/')
        targetUri += "/";
      return targetUri;
    },

    /**
     * Generates the application
     *
     * @param {Application} app
     * @param {Object} environment settings
     * @param {Maker} maker
     */
    generateApplication: function(application, environment, cb) {
      var t = this;
      var analyser = application.getAnalyser();
      var db = analyser.getDatabase();
      environment = t._mergeEnvironment(application, environment);

      var compileInfo = {
        library: null,
        namespace: null,
        application: application,
        environment: environment,
        configdata: null,
        pkgdata: null,
        assets: null,
        parts: null
      };

      var appClassname = application.getClassName();
      var library = compileInfo.library = analyser.getLibraryFromClassname(appClassname);
      var namespace = compileInfo.namespace = library.getNamespace();
      
      // Root of the application & URI
      var appRootDir = this.getApplicationRoot(application);

      util.mkpath(appRootDir, function(err) {
        if (err)
          return cb && cb(err);

        var parts = compileInfo.parts = application.getPartsDependencies();

        var configdata = compileInfo.configdata = {
          "environment": {
            "qx.application": application.getClassName(),
            "qx.revision": "",
            "qx.theme": application.getTheme(),
            "qx.version": analyser.getQooxdooVersion()
          },
          "loader": {
            "parts": {
            },
            "packages": {
            }
          },
          "libraries": {
            "__out__": {
              "sourceUri": application.getSourceUri()||"."
            }
          },
          "resources": {},
          "urisBefore": [],
          "cssBefore": [],
          "boot": "boot",
          "closureParts": {},
          "bootIsInline": false,
          "addNoCacheParam": false,
          "preBootCode": []
        };
        parts.forEach((part, index) => {
          configdata.loader.parts[part.name] = [ index ];
          var pkgdata = configdata.loader.packages[index] = { uris: [] };
          part.classes.forEach((classname) => {
            var def = db.classInfo[classname];
            pkgdata.uris.push(def.libraryName + ":" + classname.replace(/\./g, "/") + ".js");
          });
        });
        configdata.loader.packages[0].uris.unshift("__out__:" + t.getScriptPrefix() + "resources.js");

        analyser.getLibraries().forEach(function (library) {
          var arr = library.getAddScript();
          if (arr) {
            arr.forEach(function(path) {
              configdata.urisBefore.push(library.getNamespace() + ":" + path);
            });
          }
          var arr = library.getAddCss();
          if (arr) {
            arr.forEach(function(path) {
              configdata.cssBefore.push(library.getNamespace() + ":" + path);
            });
          }
        });

        for (var name in environment)
          configdata.environment[name] = environment[name];

        var pkgdata = compileInfo.pkgdata = {
          "locales": {},
          "resources": {},
          "translations": {
            "C": {}
          }
        };

        var translations = {};
        async.parallel([
            function(cb) {
              analyser.getCldr("en")
                .then((cldr) => {
                  pkgdata.locales["C"] = cldr;
                  cb();
                })
                .catch(cb);
            },

            function(cb) {
              t._writeTranslations(compileInfo, function(err) {
                cb(err);
              });
            },
            
            function(cb) {
              var promises = []
              analyser.getLibraries().forEach((library) => {
                var fonts = library.getWebFonts();
                if (fonts) {
                  fonts.forEach((font, index) => {
                    var p = font.generateForTarget(t)
                      .then(() => font.generateForApplication(t, application))
                      .then((resources) => {
                        for (var key in resources) {
                          configdata.resources[key] = resources[key];
                        }
                        var code = font.getBootstrapCode(t, application, index == 0);
                        if (code)
                          configdata.preBootCode.push(code); 
                      })
                      .catch((err) => {
                        qxcompiler.Console.print("qxcompiler.webfonts.error", font.toString(), err.toString());
                      });
                    promises.push(p);
                  });
                }
              });
              Promise.all(promises)
                .then(() => cb())
                .catch(cb);
            },

            function(cb) {
              var rm = analyser.getResourceManager();
              var assetUris = application.getAssetUris(rm, configdata.environment);
              var assets = rm.getAssets(assetUris);
              compileInfo.assets = assets;

              // Save any changes that getAssets collected
              rm.saveDatabase(function() {
                for (var i = 0; i < assets.length; i++) {
                  var asset = assets[i];
                  var m = asset.filename.match(/\.(\w+)$/);
                  var arr = pkgdata.resources[asset.filename] = [
                    asset.fileInfo.width, 
                    asset.fileInfo.height, 
                    (m && m[1]) || "", 
                    asset.libraryName
                  ];
                  if (asset.fileInfo.composite !== undefined) {
                    arr.push(asset.fileInfo.composite);
                    arr.push(asset.fileInfo.x);
                    arr.push(asset.fileInfo.y);
                  }
                }
                cb();
              });
            }
          ],
          function(err) {
            if (err)
              return cb && cb(err);
            t._writeApplication(compileInfo, cb);
          });
      });
    },

    _writeTranslations: function(compileInfo, cb) {
      const analyser = compileInfo.application.getAnalyser();
      analyser.updateTranslations(compileInfo.library, this.getLocales());
      
      this._writeLocales(compileInfo, (err) => {
        if (err)
          return cb(err);
        if (this.getWriteAllTranslations())
          this._writeAllTranslations(compileInfo, cb);
        else
          this._writeRequiredTranslations(compileInfo, cb);
      });
    },

    _writeLocales: function(compileInfo, cb) {
      var t = this;
      var analyser = compileInfo.application.getAnalyser();
      var db = analyser.getDatabase();
      var pkgdata = compileInfo.pkgdata;

      function loadLocaleData(localeId) {
        var combinedCldr = null;
        
        function accumulateCldr(localeId) {
          return analyser.getCldr(localeId)
            .then((cldr) => {
              if (!combinedCldr)
                combinedCldr = cldr;
              else {
                for (var name in cldr) {
                  var value = combinedCldr[name];
                  if (value === null || value === undefined)
                    combinedCldr[name] = cldr[name];
                }
              }
              var parentLocaleId = qxcompiler.app.Cldr.getParentLocale(localeId);
              if (parentLocaleId)
                return accumulateCldr(parentLocaleId);
              return combinedCldr;
            });
        }
        
        return accumulateCldr(localeId)
          .then(() => {
            var pos = localeId.indexOf('_');
            if (pos > -1) {
              var parentLocaleId = localeId.substring(0, pos);
              return accumulateCldr(parentLocaleId);
            }
            return combinedCldr;
          });
      }
      
      var promises = t.getLocales().map((localeId) => {
        return loadLocaleData(localeId)
          .then((cldr) => pkgdata.locales[localeId] = cldr);
      });
      
      Promise.all(promises).then(() => cb()).catch(cb);
    },

    _writeAllTranslations: function(compileInfo, cb) {
      var t = this;
      var analyser = compileInfo.application.getAnalyser();
      var db = analyser.getDatabase();

      function writeEntry(entry) {
        if (entry) {
          var pkgdataTranslations = compileInfo.pkgdata.translations[localeId];
          var msgstr = entry.msgstr;
          if (!qx.lang.Type.isArray(msgstr))
            msgstr = [msgstr];
          if (msgstr[0])
            pkgdataTranslations[entry.msgid] = msgstr[0];
          if (entry.msgid_plural && msgstr[1])
            pkgdataTranslations[entry.msgid_plural] = msgstr[1];
        }
      }
      
      var promises = t.getLocales().map((localeId) => {
        pkgdata.translations[localeId] = {};
        return analyser.getTranslation(compileInfo.library, localeId)
          .then((translation) => {
            var entries = translation.getEntries();
            for (var msgid in entries)
                writeEntry(entries[msgid]);
          });
      });
      Promise.all(promises).then(() => cb()).catch(cb);
    },
    
    _writeRequiredTranslations: function(compileInfo, cb) {
      var t = this;
      var analyser = compileInfo.application.getAnalyser();
      var db = analyser.getDatabase();
      var pkgdata = compileInfo.pkgdata;
      
      function writeEntry(localeId, entry) {
        if (entry) {
          var msgstr = entry.msgstr;
          if (!qx.lang.Type.isArray(msgstr))
            msgstr = [msgstr];
          var pkgdataTranslations = pkgdata.translations[localeId];
          if (msgstr[0])
            pkgdataTranslations[entry.msgid] = msgstr[0];
          if (entry.msgid_plural && msgstr[1])
            pkgdataTranslations[entry.msgid_plural] = msgstr[1];
        }
      }
      
      var translations = {};
      var promises = [];
      t.getLocales().forEach(function(localeId) {
        pkgdata.translations[localeId] = {};
        analyser.getLibraries().forEach(function(library) {
          promises.push(
            analyser.getTranslation(library, localeId)
              .then((translation) => {
                  var id = library.getNamespace() + ":" + localeId; 
                  translations[id] = translation;
                  writeEntry(translation.getEntry(""));
                })
            );
        });
      });
      Promise.all(promises)
        .then(() => {
          compileInfo.parts.forEach((part) => {
            part.classes.forEach((classname) => {
              var dbClassInfo = db.classInfo[classname];
              if (!dbClassInfo.translations)
                return;
              
              t.getLocales().forEach((localeId) => {
                var id = dbClassInfo.libraryName + ":" + localeId;
                var translation = translations[id];
                dbClassInfo.translations.forEach(function(transInfo) {
                  writeEntry(translation.getEntry(transInfo.msgid));
                });
              });
            });
          });
        })
        .then(cb)
        .catch((err) => cb(err));
    },

    /**
     * Writes the application
     * @param assets {Object[]} list of assets, where each asset is (see @link(qxcompiler.resources.Manager) for details)
     *  - libraryName {String}
     *  - filename {String}
     *  - fileInfo {String)
     * @param cb
     * @private
     */
    _writeApplication: function(compileInfo, cb) {
      var t = this;
      var application = compileInfo.application;
      var analyser = this.getAnalyser();
      var appRootDir = this.getApplicationRoot(application);

      function writeCompileInfo(cb) {
        if (!t.isWriteCompileInfo())
          return cb();
        var MAP = {
            EnvSettings: compileInfo.configdata.environment,
            Libinfo: compileInfo.configdata.libraries,
            UrisBefore: compileInfo.configdata.urisBefore,
            CssBefore: compileInfo.configdata.cssBefore,
            Assets: compileInfo.assets,
            Parts: compileInfo.parts
          };
        var outputDir = path.join(appRootDir, t.getScriptPrefix());

        fs.writeFile(path.join(outputDir, "compile-info.json"), 
            JSON.stringify(MAP, null, 2) + "\n", 
            { encoding: "utf8" },
            (err) => {
              if (err)
                return cb(err);
              fs.writeFile(path.join(outputDir, "resources.json"), 
                  JSON.stringify(compileInfo.pkgdata, null, 2) + "\n", 
                  { encoding: "utf8" },
                  cb);
            });
      }
      function writeBootJs(cb) {
        var MAP = {
          EnvSettings: compileInfo.configdata.environment,
          Libinfo: compileInfo.configdata.libraries,
          Resources: compileInfo.configdata.resources,
          Translations: {"C": null},
          Locales: {"C": null},
          Parts: compileInfo.configdata.loader.parts,
          Packages: compileInfo.configdata.loader.packages,
          UrisBefore: compileInfo.configdata.urisBefore,
          CssBefore: compileInfo.configdata.cssBefore,
          Boot: "boot",
          ClosureParts: {},
          BootIsInline: false,
          NoCacheParam: false,
          DecodeUrisPlug: undefined,
          BootPart: undefined,
          TranspiledPath: undefined,
          PreBootCode: compileInfo.configdata.preBootCode.join("\n")
        };
        
        if (application.getType() !== "browser") {
          MAP.TranspiledPath = path.relative(appRootDir, path.join(t.getOutputDir(), "transpiled"));
        }

        for (var i = 0, locales = analyser.getLocales(); i < locales.length; i++) {
          var localeId = locales[i];
          MAP.Translations[localeId] = null;
          MAP.Locales[localeId] = null;
        }

        fs.readFile(application.getLoaderTemplate(), { encoding: "utf-8" },
            function (err, data) {
              if (err)
                return cb(err);
              var lines = data.split('\n');
              for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var match;
                while (match = line.match(/\%\{([^}]+)\}/)) {
                  var keyword = match[1];
                  var replace = "";
                  if (MAP[keyword] !== undefined) {
                    if (keyword == "PreBootCode")
                      replace = MAP[keyword];
                    else
                      replace = JSON.stringify(MAP[keyword], null, 2);
                  }
                  var newLine = line.substring(0, match.index) + replace + line.substring(match.index + keyword.length + 3);
                  line = newLine;
                }
                if (line.match(/^\s*delayDefer:\s*false\b/))
                  line = line.replace(/false/, 'true');
                lines[i] = line;
              }
              data = lines.join('\n');
              var ws = fs.createWriteStream(appRootDir + "/" + t.getScriptPrefix() + "boot.js");
              ws.write(data);
              t._writeBootJs(compileInfo, ws, function(err) {
                ws.end();
                return cb(err);
              })
            });
      }
      
      function writeIndexHtml(cb) {
        t._writeIndexHtml(compileInfo).then(() => cb()).catch(cb);
      }
      
      function writeResourcesJs(cb) {
        fs.writeFile(appRootDir + "/" + t.getScriptPrefix() + "resources.js",
            "qx.$$packageData['0'] = " + JSON.stringify(compileInfo.pkgdata, null, 2) + ";\n",
            { encoding: "utf8" },
            function(err) {
              cb(err);
            });
      }

      async.series(
          [
            writeResourcesJs,
            function(cb) {
              async.parallel([ writeBootJs, writeIndexHtml, writeCompileInfo ],
                  function(err) {
                    if (err)
                      return cb && cb(err);
                    t._afterWriteApplication(compileInfo, cb);
                  });
            }
          ], 
          cb);
    },

    /**
     * After the first part of boot.js has been written, this is called so to optionally
     * append to the stream
     * @param writeStream {Stream} for writing
     * @param cb
     * @returns {*}
     * @private
     */
    _writeBootJs: function(compileInfo, writeStream, cb) {
      return cb();
    },

    /**
     * Called to generate index.html
     * @param cb
     * @returns {*}
     * @private
     */
    _writeIndexHtml: async function(compileInfo) {
      var t = this;
      var application = compileInfo.application;
      var appRootDir = this.getApplicationRoot(application);

      if (!t.isGenerateIndexHtml())
        return Promise.resolve();
      
      function writeDefaultIndexHtml() {
        return writeFile(appRootDir + t.getScriptPrefix() + "index.html",
            "<!DOCTYPE html>\n" +
            "<html>\n" +
            "<head>\n" +
            "  <meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\" />\n" +
            "  <title>" + (application.getTitle()||"Qooxdoo Application") + "</title>\n" +
            "</head>\n" +
            "<body>\n" +
            "  <!-- This index.html can be customised by creating a boot/index.html (do not include Qooxdoo application script tags like\n" +
            "       the one below because they will be added automatically)\n" +
            "    -->\n" +
            "  <script type=\"text/javascript\" src=\"" + t.getScriptPrefix() + "boot.js\"></script>\n" +
            "</body>\n" +
            "</html>\n", 
            { encoding: "utf8" });
      }
      
      var classname = application.getClassName();
      var library = this.getAnalyser().getLibraryFromClassname(classname);
      if (!library)
        throw new Error("Cannot find library for class " + classname);
      var bootDir = path.join(library.getRootDir(), library.getBootPath());
      var stats;
      try {
        stats = await stat(bootDir);
      }catch(ex) {
        stats = null;
      }
      if (!stats || !stats.isDirectory()) {
        return writeDefaultIndexHtml();
      }
      await qxcompiler.files.Utils.sync(bootDir, appRootDir, (from, to) => from != "index.html");
      var stats = await stat(path.join(bootDir, "index.html"));
      if (stats.isFile()) {
        var html = await readFile(path.join(bootDir, "index.html"), { encoding: "utf8" });
        var str = "<script type=\"text/javascript\" src=\"" + t.getScriptPrefix() + "boot.js\"></script>\n</body>";
        var after = html.replace(/\<\/body\>/, str);
        return writeFile(appRootDir + t.getScriptPrefix() + "index.html", after, { encoding: "utf8" });
      } else {
        return writeDefaultIndexHtml() ;
      }
    },

    /**
     * Called after everything has been written, eg to allow for post compilation steps like minifying etc
     * @param cb
     * @private
     */
    _afterWriteApplication: function(compileInfo, cb) {
      cb()
    }
  }
});
