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
const process = require("process");
const path = require("upath");
const semver = require("semver");
const fs = require("fs");

/**
 * Installs a package
 */
qx.Class.define("qx.tool.cli.commands.package.Migrate", {
  extend: qx.tool.cli.commands.Package,

  statics: {
    /**
     * Flag to prevent recursive call to process()
     */
    migrationInProcess: false,
    /**
     * Return the Yargs configuration object
     * @return {{}}
     */
    getYargsCommand: function() {
      return {
        command: "migrate",
        describe: "migrates the package system to a newer version.",
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
          return new qx.tool.cli.commands.package.Migrate(argv)
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
     * Announces or applies a migration
     * @param {Boolean} announceOnly If true, announce the migration without
     * applying it.
     */
    process: async function(announceOnly=false) {
      const self = qx.tool.cli.commands.package.Migrate;
      if (self.migrationInProcess) {
        return;
      }
      self.migrationInProcess = true;
      let needFix = false;
      // do not call this.base(arguments) here!
      let pkg = qx.tool.cli.commands.Package;
      let cwd = process.cwd();
      let migrateFiles = [
        [
          path.join(cwd, pkg.lockfile.filename),
          path.join(cwd, pkg.lockfile.legacy_filename)
        ],
        [
          path.join(cwd, pkg.cache_dir),
          path.join(cwd, pkg.legacy_cache_dir)
        ],
        [
          path.join(qx.tool.cli.ConfigDb.getDirectory(), pkg.package_cache_name),
          path.join(qx.tool.cli.ConfigDb.getDirectory(), pkg.legacy_package_cache_name)
        ]
      ];
      if (this.checkFilesToRename(migrateFiles).length) {
        let replaceInFiles = [{
          files: path.join(cwd, ".gitignore"),
          from: pkg.legacy_cache_dir + "/",
          to: pkg.cache_dir + "/"
        }];
        await this.migrate(migrateFiles, replaceInFiles, announceOnly);
        if (announceOnly) {
          needFix = true;
        } else {
          if (!this.argv.quiet) {
            console.info("Fixing path names in the lockfile...");
          }
          this.argv.reinstall = true;
          await (new qx.tool.cli.commands.package.Upgrade(this.argv)).process();
        }
      }
      // Migrate all manifest in a package; this partially duplicated code in Publish
      const registryModel = qx.tool.config.Registry.getInstance();
      let manifestModels =[];
      if (await registryModel.exists()) {
        // we have a qooxdoo.json index file containing the paths of libraries in the repository
        await registryModel.load();
        let libraries = registryModel.getLibraries();
        for (let library of libraries) {
          manifestModels.push((new qx.tool.config.Abstract(qx.tool.config.Manifest.config)).set({baseDir: path.join(cwd, library.path)}));
        }
      } else {
        manifestModels.push(qx.tool.config.Manifest.getInstance());
      }
      for (const manifestModel of manifestModels) {
        await manifestModel.set({warnOnly: true}).load();
        needFix = !qx.lang.Type.isArray(manifestModel.getValue("info.authors")) ||
            !semver.valid(manifestModel.getValue("info.version") ||
              manifestModel.keyExists({
                "info.qooxdoo-versions": null,
                "info.qooxdoo-range": null,
                "provides.type": null,
                "requires.qxcompiler": null,
                "requires.qooxdoo-sdk": null,
                "requires.qooxdoo-compiler": null
              })
        );
        if (needFix) {
          if (announceOnly) {
            console.warn("*** Manifest(s) need to be updated.");
          } else {
            manifestModel
              .transform("info.authors", authors => {
                if (authors === "") {
                  return [];
                } else if (qx.lang.Type.isString(authors)) {
                  return [{name: authors}];
                } else if (qx.lang.Type.isObject(authors)) {
                  return authors;
                }
                return [];
              })
              .transform("info.version", version => String(semver.coerce(version)))
              .unset("info.qooxdoo-versions")
              .unset("info.qooxdoo-range")
              .unset("provides.type")
              .unset("requires.qxcompiler")
              .unset("requires.qooxdoo-compiler")
              .unset("requires.qooxdoo-sdk");
          }
        }

        // update dependencies
        if (!manifestModel.getValue("requires.@qooxdoo/compiler") || !manifestModel.getValue("requires.@qooxdoo/framework")) {
          needFix = true;
          if (announceOnly) {
            console.warn("*** Framework and/or compiler dependencies in Manifest need to be updated.");
          } else {
            manifestModel
              .setValue("requires.@qooxdoo/compiler", "^" + qx.tool.compiler.Version.VERSION)
              .setValue("requires.@qooxdoo/framework", "^" + await this.getLibraryVersion(await this.getGlobalQxPath()));
            manifestModel.setWarnOnly(false);
            // now model should validate
            await manifestModel.save();
            if (!this.argv.quiet) {
              console.info(`Updated dependencies in ${manifestModel.getDataPath()}.`);
            }
          }
        }
      }
      self.migrationInProcess = false;
      if (needFix) {
        if (announceOnly) {
          console.error(`*** Please run 'qx package migrate' to apply the changes. If you don't want this, downgrade to a previous version of the compiler.`);
          process.exit(1);
        }
        console.info("Migration completed.");
      } else if (!announceOnly || !this.argv.quiet) {
        console.info("Everything is up-to-date. No migration necessary.");
      }
    }
  }
});
