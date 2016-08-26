/* ************************************************************************
 *
 *    qxcompiler - node.js based replacement for the Qooxdoo python
 *    toolchain
 *
 *    https://github.com/johnspackman/qxcompiler
 *
 *    Copyright:
 *      2011-2013 Zenesis Limited, http://www.zenesis.com
 *
 *    License:
 *      LGPL: http://www.gnu.org/licenses/lgpl.html
 *      EPL: http://www.eclipse.org/org/documents/epl-v10.php
 *
 *      This software is provided under the same licensing terms as Qooxdoo,
 *      please see the LICENSE file in the Qooxdoo project's top-level directory
 *      for details.
 *
 *    Authors:
 *      * John Spackman (john.spackman@zenesis.com)
 *
 * ************************************************************************/

var fs = require("fs");
var qx = require("qooxdoo");
var async = require("async");
var util = require("../../util");
var path = require("path");

var log = util.createLog("target");

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

    /**
     * Array of css urls to load before.
     */
    addCss: {
      init: []
    },

    /**
     * Array of script urls to load before.
     */
    addScript: {
      init: []
    }

  },

  members: {
    __libraryUris: null,

    /**
     * Initialises the target, creating directories etc
     * @param cb
     */
    open: function(cb) {
      util.mkpath(this.getOutputDir(), cb);
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
     * Specifies the URi to use for a library
     * @param libraryName {String} the library name (eg "qx")
     * @param uri {String} the URI prefix for the library
     */
    setUri: function(libraryName, uri) {
      this.__libraryUris[libraryName] = uri;
    },

    /**
     * Returns the URI for a library
     * @param libraryName
     * @returns {*|null} The URI prefix, or null if none specified
     */
    getUri: function(libraryName) {
      return this.__libraryUris[libraryName]||null;
    },

    /**
     * Sets the URI for the target
     * @param uri
     */
    setTargetUri: function(uri) {
      this.setUri("", uri);
    },

    /**
     * Returns the URI for the target
     * @return {String|null} the URI
     */
    getTargetUri: function() {
      return this.getUri("");
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
     * Generates the application
     *
     * @param {Application} app
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
        uris: null
      };

      var namespace = compileInfo.namespace = application.getClassName();
      var library = compileInfo.library = analyser.getLibraryFromClassname(namespace);

      // Root of the application & URI
      var appRootDir = this.getOutputDir() + "/";
      var appRootUri = this.getTargetUri();

      var prefixUri;
      if (appRootUri)
        prefixUri = appRootUri + "/";
      else
        prefixUri = "";

      util.mkpath(appRootDir + application.getName(), function(err) {
        if (err)
          return cb && cb(err);

        var uris = compileInfo.uris = application.getUris();

        uris.unshift("__out__:" + t.getScriptPrefix() + "resources.js");
        var configdata = compileInfo.configdata = {
          "environment": {
            "qx.application": application.getClassName(),
            "qx.revision": "",
            "qx.theme": application.getTheme(),
            "qx.version": analyser.getQooxdooVersion()
          },
          "loader": {
            "parts": {
              "boot": [
                "0"
              ]
            },
            "packages": {
              "0": {
                "uris": uris
              }
            }
          },
          "libraries": {
            "__out__": {
              "sourceUri": prefixUri + application.getName()
            }
          },
          "urisBefore": t.getAddScript(),
          "cssBefore": t.getAddCss(),
          "boot": "boot",
          "closureParts": {},
          "bootIsInline": false,
          "addNoCacheParam": false
        };

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
              analyser.getCldr("en", function(err, cldr) {
                pkgdata.locales["C"] = cldr;
                cb();
              });
            },

            function(cb) {
              t._writeTranslations(compileInfo, cb);
            },

            function(cb) {
              var rm = analyser.getResourceManager();
              var assetUris = application.getAssets(configdata.environment);
              rm.getAssets(assetUris, function (err, assets) {
                compileInfo.assets = assets;

                // Save any changes that getAssets collected
                rm.saveDatabase();

                for (var i = 0; i < assets.length; i++) {
                  var asset = assets[i];
                  var arr = pkgdata.resources[asset.filename] = [
                    asset.fileInfo.width, asset.fileInfo.height, (asset.filename.match(/\.(\w+)$/)[1]) || "", asset.libraryName
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
      if (this.getWriteAllTranslations())
        this._writeAllTranslations(compileInfo, cb);
      else
        this._writeRequiredTranslations(compileInfo, cb);
    },

    _writeAllTranslations: function(compileInfo, cb) {
      var t = this;
      var analyser = compileInfo.application.getAnalyser();
      var db = analyser.getDatabase();

      async.each(t.getLocales(),
          function(localeId, cb) {
            analyser.getCldr(localeId, function(err, cldr) {
              compileInfo.pkgdata.locales[localeId] = cldr;
              var pkgdataTranslations = compileInfo.pkgdata.translations[localeId] = {};

              analyser.getTranslation(compileInfo.library, localeId, function(err, translation) {
                function writeEntry(entry) {
                  if (entry) {
                    var msgstr = entry.msgstr;
                    if (!qx.lang.Type.isArray(msgstr))
                      msgstr = [msgstr];
                    if (msgstr[0])
                      pkgdataTranslations[entry.msgid] = msgstr[0];
                    if (entry.msgid_plural && msgstr[1])
                      pkgdataTranslations[entry.msgid_plural] = msgstr[1];
                  }
                }
                if (err)
                  return cb(err);

                var entries = translation.getEntries();
                for (var msgid in entries)
                    writeEntry(entries[msgid]);
                cb();
              });
            });
          },
          cb);
    },

    _writeRequiredTranslations: function(compileInfo, cb) {
      var t = this;
      var analyser = compileInfo.application.getAnalyser();
      var db = analyser.getDatabase();
      var pkgdata = compileInfo.pkgdata;

      async.each(t.getLocales(),
          function(localeId, cb) {
            analyser.getCldr(localeId, function(err, cldr) {
              pkgdata.locales[localeId] = cldr;
              pkgdata.translations[localeId] = {};
              cb();
            });
          },
          function(err) {
            if (err)
              return cb(err);
            async.each(compileInfo.uris,
                function(uri, cb) {
                  var segs = uri.split(':');
                  var namespace = segs[0];
                  if (namespace == "__out__")
                    return cb();
                  var classname = segs[1].replace(/\.js$/, "").replace(/\//g, '.');
                  var dbClassInfo = db.classInfo[classname];
                  if (!dbClassInfo.translations)
                    return cb(err);

                  async.each(t.getLocales(),
                      function(localeId, cb) {
                        analyser.getTranslation(compileInfo.library, localeId, function(err, translation) {
                          function writeEntry(entry) {
                            if (entry) {
                              var msgstr = entry.msgstr;
                              if (!qx.lang.Type.isArray(msgstr))
                                msgstr = [msgstr];
                              if (msgstr[0])
                                pkgdataTranslations[entry.msgid] = msgstr[0];
                              if (entry.msgid_plural && msgstr[1])
                                pkgdataTranslations[entry.msgid_plural] = msgstr[1];
                            }
                          }
                          if (err)
                            return cb(err);

                          var pkgdataTranslations = pkgdata.translations[localeId];

                          writeEntry(translation.getEntry(""));
                          dbClassInfo.translations.forEach(function(transInfo) {
                            writeEntry(translation.getEntry(transInfo.msgid));
                          });
                          cb();
                        });
                      },
                      cb);
                },
                cb);
          });
    },

    /**
     * Writes the application
     * @param assets {Object[]} list of assets, where each asset is (see @link(qxcompiler.ResourceManager) for details)
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
      var appRootDir = this.getOutputDir() + "/";

      async.parallel([
          function (cb) {
            var MAP = {
              EnvSettings: compileInfo.configdata.environment,
              Libinfo: compileInfo.configdata.libraries,
              Resources: {},
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
              BootPart: undefined
            };

            for (var i = 0, locales = analyser.getLocales(); i < locales.length; i++) {
              var localeId = locales[i];
              MAP.Translations[localeId] = null;
              MAP.Locales[localeId] = null;
            }

            fs.readFile(analyser.getQooxdooPath() + "/../tool/data/generator/loader.tmpl.js",
                {encoding: "utf-8"},
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
                      if (MAP[keyword] !== undefined)
                        replace = JSON.stringify(MAP[keyword], null, 2);
                      var newLine = line.substring(0, match.index) + replace + line.substring(match.index + keyword.length + 3);
                      line = newLine;
                    }
                    if (line.match(/^\s*delayDefer:\s*false\b/))
                      line = line.replace(/false/, 'true');
                    lines[i] = line;
                  }
                  data = lines.join('\n');
                  var ws = fs.createWriteStream(appRootDir + application.getName() + "/" + t.getScriptPrefix() + "boot.js");
                  ws.write(data);
                  t._writeBootJs(compileInfo, ws, function(err) {
                    ws.end();
                    return cb(err);
                  })
                });
          },

          function (cb) {
            t._writeIndexHtml(compileInfo, function(err) {
              cb(err);
            });
          },

          function (cb) {
            fs.writeFile(appRootDir + application.getName() + "/" + t.getScriptPrefix() + "resources.js",
                "qx.$$packageData['0'] = " + JSON.stringify(compileInfo.pkgdata, null, 2) + ";\n",
                function(err) {
                  cb(err);
                });
          },

          function (cb) {
            fs.writeFile(appRootDir + application.getName() + "/" + t.getScriptPrefix() + "resources.json",
                JSON.stringify(compileInfo.pkgdata, null, 2) + "\n",
                function(err) {
                  cb(err);
                });
          }
        ],
        function(err) {
          if (err)
            return cb && cb(err);
          t._afterWriteApplication(compileInfo, cb);
        });
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
    _writeIndexHtml: function(compileInfo, cb) {
      var t = this;
      var application = compileInfo.application;
      var appRootDir = this.getOutputDir() + "/";

      if (!t.isGenerateIndexHtml())
        return cb();
      fs.writeFile(appRootDir + t.getScriptPrefix() + application.getName() + ".html",
          "<!DOCTYPE html>\n" +
          "<html>\n" +
          "<head>\n" +
          "  <meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\" />\n" +
          "  <title>skeleton</title>\n" +
          "  <script type=\"text/javascript\" src=\"" + application.getName() + "/" + t.getScriptPrefix() + "boot.js\"></script>\n" +
          "</head>\n" +
          "<body></body>\n" +
          "</html>\n",
          cb);
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
