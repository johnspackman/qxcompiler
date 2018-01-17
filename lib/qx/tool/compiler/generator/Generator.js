/* ************************************************************************
 *
 *    qooxdoo-compiler - node.js based replacement for the Qooxdoo python
 *    toolchain
 *
 *    https://github.com/qooxdoo/qooxdoo-compiler
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

/**
 * generator.js
 *
 * Provides a loose implementation comparable to Qooxdoo's generator.py
 */

var fs = require("fs");
var async = require("async");
var util = require("../util");

require("../Analyser");
require("../app/Application");
require("../app/Library");
require("./Config");

var log = util.createLog("main");

/**
 * Generator
 */
qx.Class.define("qx.tool.compiler.generator.Generator", {
  extend: qx.core.Object,

  members: {
    __options: {},
    __analyser: null,
    __buildCfg: null,
    __app: null,
    __dir: null,

    /**
     * Processes the command line
     * @param argv
     * @returns {map} options detected
     */
    processCommandLine: function (argv) {
      if (argv === undefined)
        argv = process.argv;

      var options = this.__options = {};
      this.__dir = "";
      for (var i = 0; i < argv.length; i++) {
        var arg = argv[i];
        if (arg == "--no-resources")
          options.processResources = false;
        else if (arg == "--log")
          options.logSettings = process.argv[++i];
        else if (/^[a-z0-9_-]+$/.test(arg))
          options.buildType = arg;
        else if (arg == "--app-dir")
          this.__dir = process.argv[++i] + "/";
      }
      ;
      return options;
    },

    /**
     * Loads the config.json from current directory
     */
    loadConfig: function (callback) {
      var t = this;
      fs.exists(t.__dir + "config.json", function (exists) {
        if (!exists) {
          log.error("Cannot find config.json");
          return callback && callback(new Error("Cannot find config.json"));
        }
        log.debug("Loading config.json");
        var config = new qx.tool.compiler.generator.Config(t.__dir + "config.json");
        config.load(function () {
          var analyser = t.getAnalyser();
          var buildCfg = t.__buildCfg = config.getAnalyserConfig(t.__options.buildType);
          log.trace(JSON.stringify(buildCfg, null, 2));

          buildCfg.includeClasses.forEach(function (className) {
            analyser.addClass(className);
          });
          buildCfg.libraries.forEach(function (library) {
            analyser.addLibrary(new qx.tool.compiler.Libary().set({
              namespace: library.libraryName,
              rootDir: library.rootDir,
              sourcePath: library.sourcePath,
              resourcePath: library.resourcePath
            }));
          });
          if (callback)
            callback();
        });
      });
    },

    /**
     * Does the generation
     * @param callback
     */
    generate: function (callback) {
      var t = this;
      var buildCfg = t.__buildCfg;
      if (!buildCfg)
        t.loadConfig();
      var analyser = t.getAnalyser();

      log.debug("Analysing");
      analyser.run(function (err) {
        if (err) throw err;

        // Write it
        var db = analyser.getDatabase();
        fs.writeFile(t.__dir + "db.js", "var db = " + JSON.stringify(db, null, 2));

        // Get dependencies
        var app = this.__app = new qx.tool.compiler.app.Application(analyser, buildCfg.includeClasses);
        app.set({
          environment: buildCfg.environment
        });
        app.calcDependencies();
        app.writeApplication(callback);

      });
    },

    getAnalyser: function () {
      if (!this.__analyser)
        this.__analyser = new qx.tool.compiler.Analyser();
      return this.__analyser;
    },

    getApplication: function () {
      return this._app;
    }
  }
});

module.exports = qx.tool.compiler.Generator;
