'use strict'

let fs = require('fs')
let program = require('commander')
let { resolve } = require('upath')

function parse (argv) {
  // Parse command line
  program
    .version('0.0.2')
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
  let files = (program.file || []).concat(program.args.map(validate).filter(v => !!v))
  let task = { encrypt: !!program.E, decrypt: !!program.D, clean: !!program.C }

  return { files, output: program.out, task, verbose: !!program.verbose }
}

function validate (mod) {
  if (fs.existsSync(mod)) {
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
  if (!fs.existsSync(mod) && fs.existsSync(resolve(mod, '../'))) {
    memo.push(resolve(mod))
  }
  return memo
}

module.exports = { parse, help: program.help.bind(program) }
