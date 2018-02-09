set -x 
rm -rf myapp
qx create myapp -I --type server -v || exit $?
cd myapp
qx compile -v --clean || exit $?
node source-output/myapp/myapp.js || exit $?
qx contrib update  -v|| exit $?
qx contrib list    -v|| exit $?
qx contrib install oetiker/UploadWidget --release v1.0.0 -v || exit $?
qx contrib install cboulanger/qx-contrib-Dialog --release v1.3.0-beta.3 -v || exit $?
qx contrib install johnspackman/UploadMgr --release v1.0.0 -v || exit $?
qx compile -v --clean || exit $?
node source-output/myapp/myapp.js || exit $?
rm -rf contrib  || exit $?
qx contrib install -v || exit $?
qx compile -v --clean || exit $?
node source-output/myapp/myapp.js
qx contrib remove cboulanger/qx-contrib-Dialog -v || exit $?
qx compile -v --clean || exit $?
node source-output/myapp/myapp.js || exit $?
qx add class myapp.Window --extend=qx.ui.window.Window || exit $?
qx add script ../testdata/npm/script/jszip.js --rename=zip.js || exit $?
cp ../testdata/npm/application/*.js source/class/myapp
qx lint --fix --warnAsError ||  exit $?
qx compile -v --clean || exit $?
node source-output/myapp/myapp.js || exit $?
