'use strict'

const program = require('commander')
const { resolve, joinSafe } = require('upath')
const { existsSync } = require('fs')

function parse (argv) {
  // Parse command line
  program
    .version('0.2.0')
    .option('-e, -E, --encrypt', 'Encrypt the file/directory', /^(e)$/i)
    .option('-d, -D, --decrypt', 'Decrypt the file/directory', /^(d)$/i)
    .option('-c, -C, --clean', 'Whether to delete the original file/directory or not (defaults to false)', /^(c)$/i)
    .option('-f, --file <path> [, <path>, <path> ...]', 'Files/directories to encrypt/decrypt', modules, [])
    .option('-o, --out <path>', 'Destination file', enoentModules, [])
    .option('-v, --verbose', 'Output more verbose', /^(v)$/i)
    .parse(argv || process.argv)

  // We cannot continue if:
  //  - there is no input file OR
  //  - we are given encrypt AND decrypt options(no possible choice) OR
  //  - we are given no encrypt nor decrypt options(no possible choice)
  const files = (program.file || []).concat(program.args.map(validate).filter(v => !!v))
  const task = { encrypt: !!program.E, decrypt: !!program.D, clean: !!program.C }

  return {
    files: files,
    output: program.out[ 0 ] || joinSafe(process.cwd() + '/data'),
    task: task,
    verbose: !!program.verbose
  }
}

function validate (mod) {
  if (existsSync(mod)) {
    return resolve(mod)
  } else {
    return null
  }
}

function modules (mod, memo) {
  if ((mod = validate(mod))) {
    memo.push(mod)
  }
  return memo
}

function enoentModules (mod, memo) {
  if (!existsSync(mod) && existsSync(resolve(mod, '../'))) {
    memo.push(resolve(mod))
  }
  return memo
}

module.exports = { parse: parse, help: program.help.bind(program) }
