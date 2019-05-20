/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2017 Christian Boulanger

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Christian Boulanger (info@bibliograph.org, @cboulanger)

************************************************************************ */
require("../Package");

require("@qooxdoo/framework");
const fs = require("fs");
const process = require("process");
const path = require("upath");
const rimraf = require("rimraf");

/**
 * Installs a package
 */
qx.Class.define("qx.tool.cli.commands.package.Remove", {
  extend: qx.tool.cli.commands.Package,

  statics: {
    getYargsCommand: function() {
      return {
        command: "remove [uri]",
        describe: "removes a package from the configuration.",
        builder: {
          "verbose": {
            alias: "v",
            describe: "Verbose logging"
          },
          "quiet": {
            alias: "q",
            describe: "No output"
          }
        },
        handler: function(argv) {
          return new qx.tool.cli.commands.package.Remove(argv)
            .process()
            .catch(e => {
              console.error(e.stack || e.message);
              process.exit(1);
            });
        }
      };
    }
  },

  members: {

    /**
     * Removes packages
     */
    process: async function() {
      await this.base(arguments);
      if (!this.argv.uri) {
        throw new qx.tool.cli.Utils.UserError("No repository name given.");
      }
      // read libraries array from the lockfile
      let data = await this.getLockfileData();
      // currently, the uri is github_username/repo_name[/path/to/repo].
      let parts = this.argv.uri.split(/\//);
      let tag = (parts.length > 2)?"uri":"repo_name";

      let found = [];
      let libraries = [];
      for (const elem of data.libraries) {
        if (elem[tag] === this.argv.uri) {
          await this.__removeApplication(elem.uri);
          await this.__deleteRequiredFromManifest(elem.uri);
          let c = elem.path.split(/\//).length;
          let p = elem.path;
          if (c > parts.length) {
            p = path.dirname(p);
          }
          if (!found.includes(p)) {
            found.push(p);
          }
        } else {
          libraries.push(elem);
        }
      }
      if (found.length) {
        for (const p of found) {
          rimraf.sync(p);
        }
        if (!this.argv.quiet) {
          console.info(`Deleted ${found.length} entries for ${this.argv.uri}`);
        }
      } else if (this.argv.verbose) {
        console.warn(`No entry for ${this.argv.uri}`);
      }
      data.libraries = libraries;
      fs.writeFileSync(this.getLockfilePath(), JSON.stringify(data, null, 2), "utf-8");

      if (this.argv.verbose) {
        console.info(">>> Done.");
      }
    },

    __deleteRequiredFromManifest: async function(uri) {
      let manifest = await qx.tool.compiler.utils.Json.loadJsonAsync(qx.tool.ConfigSchemas.manifest.filename);
      if (manifest.requires && manifest.requires[uri]) {
        delete manifest.requires[uri];
        await qx.tool.compiler.utils.Json.saveJsonAsync(qx.tool.ConfigSchemas.manifest.filename, manifest);
      }
    },

    /**
     * Removes installed applications
     * @param uri
     * @return {Promise<void>}
     * @private
     */
    __removeApplication: async function(uri) {
      let pkgData = await this.getLockfileData();
      let libraryData = pkgData.libraries.find(data => data.uri === uri);
      if (!libraryData) {
        throw new Error("Repo for " + uri + " is not an installed package");
      }

      let manifest = await qx.tool.compiler.utils.Json.loadJsonAsync(path.join(libraryData.path, qx.tool.ConfigSchemas.manifest.filename));
      if (!manifest || !manifest.provides || !manifest.provides.application) {
        if (this.argv.verbose) {
          console.info(">>> No application to remove.");
        }
        return;
      }

      let compileData = await qx.tool.compiler.utils.Json.loadJsonAsync(qx.tool.ConfigSchemas.compile.filename);
      let manifestApp = manifest.provides.application;
      let app = compileData.applications.find(app => {
        if (manifestApp.name && app.name) {
          return manifestApp.name === app.name;
        }
        return manifestApp["class"] === app["class"];
      });
      if (app) {
        let idx = compileData.applications.indexOf(app);
        compileData.applications.splice(idx, 1);

        if (this.argv.verbose) {
          console.info(">>> Removed application " + (app.name||app["class"]));
        }
        await qx.tool.compiler.utils.Json.saveJsonAsync(qx.tool.ConfigSchemas.compile.filename, compileData);
      }
    }
  }
});
