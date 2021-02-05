# Qooxdoo Compiler and Command Line Interface
[![NPM Version][npm-image]][npm-url] 
[![Gitter][gitter-image]][gitter-url]

Qooxdoo-Compiler is the new compiler and command line interface for Qooxdoo 
(http://qooxdoo.org) applications, written in 100% Node.JS Javascript it adds 
these key improvements over the standard python generator:

* Includes Babel for adding ES6 to all Qooxdoo applications 
* Fast (up to 24x faster) and low resource usage (tiny cache, low CPU usage)
* Flexible and powerful command line tool for compiling and modifying applications
* Backward compatible with existing Qooxdoo apps
* Written in 100% Javascript
* API based, easily extended and with dependency information available at runtime

One of the top goals of this project is to be very fast and lightweight - fast
enough to detect code changes and recompile  applications on the fly on a
production server, with an application recompile costing a few hundreds of
milliseconds.

The included command line utility allows you create, build and manage
[qooxdoo](http://www.qooxdoo.org) applications (note that Qooxdoo-Compiler now
incorporates the Qooxdoo-CLI project, which used to be a separate repo).

## Documentation

Detailed documentation on the compiler is available in the dedicated chapter of
the [qooxdoo Manual](https://qooxdoo.org/documentation/#/development/compiler/).

## Development status

Beta. The API has mostly stabilized, we will provide a migration path for any
backward-incompatible changes.
Api reference of the compiler can be found here: https://qooxdoo.org/qooxdoo-compiler/#

## Prerequisites

- **Node** Currently requires NodeJS >= v8. We recommend you consider `nvm` to
ease installing and switching between node versions - you can find the Linux
version at http://nvm.sh and there is a version for Windows at
https://github.com/coreybutler/nvm-windows

- **Qooxdoo** The compiler works with all qooxdoo versions >= v6.0.0, which is 
contained in the current master branch. 
 
Install `nvm` and then:

```bash
nvm install 8 # or 10
nvm use 8 # or 10
```

## Test drive

For more detailed information about installation and use of the compiler, refer
to the [documentation](https://qooxdoo.org/documentation/#/development/compiler/). 

Here's how you can do a quick test drive:

```bash
npm install -g @qooxdoo/compiler
qx create myapp --noninteractive
cd myapp
qx package install qooxdoo/qxl.apiviewer
qx package install qooxdoo/qxl.widgetbrowser
qx serve -S
```
Wait for the message `Web server started, please browse to http://localhost:8080`,
then open that address in the browser. 

The above test drive uses a global installation of qooxdoo and its compiler. For 
development of more than one project, you may want an installation of qooxdoo local to the
project. Local installation is described in the
[Getting Started documentation](https://qooxdoo.org/documentation/#/development/compiler/?id=installing-locally).

## Run GitHub Version

If always want to have the newest version of the compiler or you want help us in development you can install it directly from the GitHub repo:

Using `npm link`:

```bash
git clone https://github.com/qooxdoo/qooxdoo-compiler.git
cd qooxdoo-compiler
npm install
./bootstrap-compiler
./tmp/qx deploy
npm link
```
or just run `bootstrap-compiler` and add either bin/source (or bin/build) onto your PATH and then they have the version of the compiler under development. 

When working on the compiler itself, cd to the compile directory and `run ./tmp/qx compile --watch` (possibly with --target=build if you want to test the build version), that is the fastest way to get it running.

## Frequently Asked Questions

## Is the compiler stable enough to be used in a production project?

Qooxdoo Compiler is a BETA RELEASE and of course, you use at your own risk.
However, it is in use in several major production applications maintained by the
qooxdoo core developers and therefore you can be fairly confident that we cherish
stability and every major bug that comes up will be fixed ASAP. 

Because of its beta status, you should upgrade to the newest NPM version with caution.
A new version is released on each commit to the master branch. The integrity of the
code is tested before a release. However, you should always test a new release thoroughly
with your application before using it to build any production code. If you find that
something is broken, please [create an issue](https://github.com/qooxdoo/qooxdoo-compiler/issues/new/choose).

You can always revert to a previous release by picking a version 
[on the NPM website](https://www.npmjs.com/package/@qooxdoo/compiler?activeTab=versions)
and executing 

```bash
npm install @qooxdoo/compiler@1.0.0-beta.XXXXXX-YYYY
```
(replace XXXXX-YYYY by the date string).

### Gotchas

Number one gotcha is that you have to run the compiler every time you change
your code, because it's being transpiled. The `qx compile` command has a
`--watch` parameter that enables continuous compilation.  Note that the `qx
serve` command always used continuous compilation.

### What about config.json? QOOXDOO_PATH?

`config.json` is not used by the `qx` command - instead it uses a new, and much
simpler configuration [file called `compile.json`](docs/configuration/compile.md).
The path to the qooxdoo library does not need to be specified since the compiler
comes with its own copy of the framework, if this is not what you want, you can
use the CLI to set the path:
```
qx config set qx.libraryPath /path/to/qooxdoo/framework
```

### Is Qooxdoo-Compiler a complete replacement for generate.py?

The compiler is a full equivalent as far as compiling is concerned, and much
faster at that. However, its domain is compiling applications (including
collecting resources) whereas generate.py included features for building and
running test suites, creating API documentation, building distributions,
creating skeleton applications, etc. These features have not been replicated.
Instead, you can do all these things with code now in a [file called `compile.js`](docs/configuration/compile.md#compilejs)

## Contributing and Getting In Touch

Please get stuck in to any aspects you'd like to work on - We're open to pull
requests, and you can contact us to chat about features you'd like to see or
help on using or extending Qooxdoo-Compiler.  The best place to talk about it is
on Gitter at https://gitter.im/qooxdoo/qooxdoo

[npm-image]: https://badge.fury.io/js/%40qooxdoo%2Fcompiler.svg
[npm-url]: https://npmjs.org/package/@qooxdoo/compiler
[travis-image]: https://travis-ci.org/qooxdoo/qooxdoo-compiler.svg?branch=master
[travis-url]: https://travis-ci.org/qooxdoo/qooxdoo-compiler
[gitter-image]: https://badges.gitter.im/qooxdoo/qooxdoo.svg
[gitter-url]: https://gitter.im/qooxdoo/qooxdoo?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
