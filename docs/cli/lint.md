### Lint

To check your project with eslint you can use `qx lint`.
The command has the following options:

```
qx lint [files...]

Options:
  --fix              runs eslint with --fix
  --cache            operate only on changed files (default: `false`).
  --warnAsError, -w  handle warnings as error
  --config, -c       prints the eslint configuration
  --format, -f       format of the output (default: `codeframe`, options: `codeframe`, `checkstyle`)
  --outputFile, -o   output the results to the specified file
  --verbose, -v      enables additional progress output to console

```

Configuration is done in the `compile.json` file, see here [here](compile-json.md).

If no special lint configuration is given in `compile.json` the configuration `@qooxdoo/qx/browser` from
[eslint-qx-rules](https://github.com/qooxdoo/eslint-qx-rules/blob/master/README.md) is used.

If `compile.json` does not exist, `qx lint` tries to use `.eslintrc`.