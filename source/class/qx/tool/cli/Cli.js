/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2018 Zenesis Ltd

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * John Spackman (john.spackman@zenesis.com, @johnspackman)

************************************************************************ */

require("@qooxdoo/framework");
const path = require("path");

/**
 * Entry point for the CLI
 */
/* global window */

qx.Class.define("qx.tool.cli.Cli", {
  extend: qx.core.Object,

  members: {
    run: function() {
      if (qx.core.Environment.get("runtime.name") == "rhino") {
        qx.log.Logger.register(qx.log.appender.RhinoConsole);
      } else if (qx.core.Environment.get("runtime.name") == "node.js") {
        qx.log.Logger.register(qx.log.appender.NodeConsole);
      }

      var args = qx.lang.Array.clone(process.argv);
      args.shift();
      process.title = args.join(" ");

      // main config
      var title = "qooxdoo command line interface";
      title = "\n" + title + "\n" + "=".repeat(title.length) + "\n";
      title += `Versions: @qooxdoo/compiler v${qx.tool.compiler.Version.VERSION}\n\n`;
      title +=
      `Typical usage:
        qx <commands> [options]
        
      Type qx <command> --help for options and subcommands.`;

      let yargs = require("yargs").locale("en");
      qx.tool.cli.Cli.addYargsCommands(yargs,
        [
          "Add",
          "Clean",
          "Compile",
          "Config",
          "Package",
          "Pkg", // alias for Package
          "Contrib", // deprecated
          "Create",
          "Lint",
          "Serve"
        ],
        "qx.tool.cli.commands");
      return yargs
        .usage(title)
        .demandCommand()
        .strict()
        .version()
        .showHelpOnFail()
        .help()
        .argv;
    }
  },

  statics: {
    /**
     * Adds commands to Yargs
     *
     * @param yargs {yargs} the Yargs instance
     * @param classNames {String[]} array of class names, each of which is in the `packageName` package
     * @param packageName {String} the name of the package to find each command class
     */
    /* @ignore qx.tool.$$classPath */
    addYargsCommands: function(yargs, classNames, packageName) {
      let pkg = null;
      packageName.split(".").forEach(seg => {
        if (pkg === null) {
          pkg = window[seg];
        } else {
          pkg = pkg[seg];
        }
      });
      classNames.forEach(cmd => {
        require(path.join(qx.tool.$$classPath, packageName.replace(/\./g, "/"), cmd));
        let data = pkg[cmd].getYargsCommand();
        if (data) {
          yargs.command(data);
        }
      });
    }
  }
});
