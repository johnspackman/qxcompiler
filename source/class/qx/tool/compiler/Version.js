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
 * *********************************************************************** */

qx.Class.define("qx.tool.compiler.Version", {
  extend: qx.core.Object,

  statics: {
    VERSION: null
  },

  defer: function(statics) {
    try {
      var pkg = require("../../../../../package.json");
      statics.VERSION = pkg.version;
    } catch (e) {
      statics.VERSION = qx.core.Environment.get("qx.compiler.version");
      if (!statics.VERSION) {
        // Compatibility issue: Older compiler has version in qx.compilerVersion
        statics.VERSION = qx.core.Environment.get("qx.compilerVersion");
      }
    }
  }
});
