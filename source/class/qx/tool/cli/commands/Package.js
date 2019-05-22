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

require("./Command");

require("@qooxdoo/framework");
const fs = qx.tool.utils.Promisify.fs;
const path = require("upath");
const process = require("process");
const jsonlint = require("jsonlint");

/**
 * Handles library packages
 */
qx.Class.define("qx.tool.cli.commands.Package", {
  extend: qx.tool.cli.commands.Command,

  statics: {
    /**
     * The name of the directory in which to download the package files
     */
    cache_dir: "qx_packages",
    /**
     * The previous name of the directory in which to download the package files
     */
    legacy_cache_dir: "contrib",
    /**
     * The name of the file that caches the package registry
     */
    package_cache_name: "package-cache.json",
    /**
     * The previous name of the file that caches the package registry
     */
    legacy_package_cache_name: "contrib-cache.json",
    /**
     * The lockfile with library versions etc.
     */
    lockfile: {
      filename: "qx-lock.json",
      legacy_filename: "contrib.json"
    },
    /**
     * The URL of the cached repository data
     */
    repository_cache_url: "https://raw.githubusercontent.com/qooxdoo/qx-contrib/master/cache.json",
    /**
     * The yargs command data
     * @return {{}}
     */
    getYargsCommand: function() {
      return {
        command : "package <command> [options]",
        desc : "manages qooxdoo packages",
        builder : yargs => {
          qx.tool.cli.Cli.addYargsCommands(yargs, [
            "Install",
            "List",
            "Publish",
            "Remove",
            "Update",
            "Upgrade",
            "Migrate"
          ], "qx.tool.cli.commands.package");
          return yargs
            .showHelpOnFail()
            .help();
        }
      };
    }
  },

  members: {

    /**
     * The current cache object
     */
    __cache : null,

    /**
     * Returns the absolute path to the lockfile.
     * @return {String}
     */
    getLockfilePath: function() {
      return path.join(process.cwd(), qx.tool.config.Lockfile.getInstance().getFileName());
    },

    /**
     * Deletes the lockfile
     * @return {Promise<void>}
     */
    async deleteLockfile() {
      await fs.unlinkAsync(this.getLockfilePath());
    },

    /**
     * Returns the library list from the lockfile
     * @return {Object}
     */
    getLockfileData: async function() {
      let lockfile_path = this.getLockfilePath();
      if (!await fs.existsAsync(lockfile_path)) {
        return {
          version: qx.tool.config.Lockfile.getInstance().getVersion(),
          libraries: []
        };
      }
      return qx.tool.utils.Json.loadJsonAsync(lockfile_path);
    },

    /**
     * Returns the tag name of the given library in the given package, if installed.
     * Returns false if not installed.
     * @param {String} repo_name
     * @param {String} library_name
     * @return {String|false}
     */
    getInstalledLibraryTag : async function(repo_name, library_name) {
      let library = (await this.getLockfileData()).libraries.find(lib => lib.repo_name === repo_name && lib.library_name === library_name);
      return library ? library.repo_tag : false;
    },

    /**
     * Returns the data of the given library, if installed.
     * Returns false if not installed.
     * @param {String} library_name
     * @return {Object|false}
     */
    getInstalledLibraryData : async function(library_name) {
      return (await this.getLockfileData()).libraries.find(lib => lib.library_name === library_name);
    },

    /**
     * Returns the absolute path to the file that persists the cache object
     * @return {String}
     */
    getCachePath : function() {
      return path.join(qx.tool.cli.ConfigDb.getDirectory(), this.self(arguments).package_cache_name);
    },

    /**
     * Returns the URL of the package registry data on GitHub
     * @return {String}
     */
    getRepositoryCacheUrl : function() {
      return this.self(arguments).repository_cache_url;
    },

    /**
     * Returns the cache object, retrieving it from a local file if necessary
     * @return {Object}
     */
    getCache : function(readFromFile = false) {
      if (!readFromFile && this.__cache && typeof this.__cache == "object") {
        return this.__cache;
      }
      try {
        this.__cache = jsonlint.parse(fs.readFileSync(this.getCachePath(), "UTF-8"));
      } catch (e) {
        this.__cache = {
          repos : {
            list : [],
            data : {}
          },
          compat : {}
        };
      }
      return this.__cache;
    },

    /**
     * Manually overwrite the cache data
     * @param data {Object}
     * @return {void}
     */
    setCache : function(data) {
      this.__cache = data;
    },

    /**
     * Saves the cache to a hidden local file
     * @return {void}
     */
    saveCache : async function() {
      await qx.tool.utils.Utils.makeParentDir(this.getCachePath());
      await fs.writeFileAsync(this.getCachePath(), JSON.stringify(this.__cache, null, 2), "UTF-8");
    },

    /**
     * Exports the cache to an external file. Note that the structure of the cache
     * data can change any time. Do not build anything on it. You have been warned.
     * @param path {String}
     * @return {void}
     */
    exportCache : async function(path) {
      try {
        await fs.writeFileAsync(path, JSON.stringify(this.__cache, null, 2), "UTF-8");
      } catch (e) {
        console.error(`Error exporting cache to ${path}:` + e.message);
        process.exit(1);
      }
    },

    /**
     * Clears the cache
     */
    clearCache : function() {
      this.__cache = null;
      try {
        fs.unlinkSync(this.getCachePath());
      } catch (e) {}
    }
  }
});
