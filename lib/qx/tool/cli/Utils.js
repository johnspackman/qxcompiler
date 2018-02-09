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
require("qooxdoo"); 
/**
 * Utility methods
 */
qx.Class.define("qx.tool.cli.Utils", {
  extend: qx.core.Object,
  
  statics: {
    /**
     * Creates a Promise which can be resolved/rejected externally - it has
     * the resolve/reject methods as properties
     * 
     * @return {Promise}
     */
    newExternalPromise: function() {
      var resolve, reject;
      var promise = new Promise((resolve_, reject_) => {
        resolve = resolve_;
        reject = reject_;
      });
      promise.resolve = resolve;
      promise.reject = reject;
      return promise;
    },

    /**
     * Error that can be thrown to indicate wrong user input  and which doesn't 
     * need a stack trace
     * @param {string} message
     * @return {Error}
     */
    UserError : function(message) {
      var error = new Error(message);
      error.name = 'UserError';
      error.stack = null;
      return error;
    },
    
    /**
     * Formats the time in a human readable format, eg "1h 23m 45.678s"
     * 
     * @param {Integer} milliseconds
     * @return {String} formatted string
     */
    formatTime: function (millisec) {
      var seconds = Math.floor(millisec / 1000);
      var minutes = Math.floor(seconds / 60);
      var hours = Math.floor(minutes / 60);
      millisec = millisec % 1000;
      
      var result = "";
      if (hours) {
        result += ((hours > 9) ? hours : "0" + hours) + "h ";
      }
      if (hours || minutes) {
        result += ((minutes > 9) ? minutes : "0" + minutes) + "m ";
      }
      if (seconds > 9 || (!hours && !minutes))
        result += seconds;
      else if (hours || minutes)
        result += "0" + seconds;
      result +=  "." + ((millisec > 99) ? "" : millisec > 9 ? "0" : "00") + millisec + "s";
      return result;
    }
    
  }
});
