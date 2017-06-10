#!/usr/bin/env node

'use strict'
// Dependencies
const { tmpdir } = require('os')
const { each, waterfall } = require('async')
const { mkdirSync, remove } = require('fs-extra')
const { joinSafe, trimExt, basename } = require('upath')

const archiver = require(joinSafe(__dirname, 'archiver'))
const argParser = require(joinSafe(__dirname, 'args'))
const acquirePass = require(joinSafe(__dirname, 'password'))
const { encryptFile, decryptFile } = require(joinSafe(__dirname, 'encryptor'))

let tmpDir = null
const { files, output, task, verbose } = argParser.parse(process.argv)

const tasks = {
  encrypt: (password, callback) => {
    // If encrypting ask password twice
    acquirePass('re-enter', (err, verify) => {
      if (err) {
        return callback(err)
      }

      if (verify !== password) {
        return callback('Passwords do not match')
      }

      tmpDir = joinSafe(tmpdir(), getRandName() + 'zip')
      const archive = archiver.prepare(tmpDir, 'zip', (err) => {
        if (err) {
          return callback(err)
        }

        encryptFile(tmpDir, output, password, callback)
      })
      console.log('Encrypting files...')
      files.forEach(archive.addEntry)
      archive.finalize()
    })
  },
  decrypt: (password, callback) => {
    const outputs = []
    if (files.length > 1) {
      // When decrypting multiple files, output is a directory
      try { mkdirSync(output) } catch (e) {
        return callback('Unable to create destiny directory')
      }
      files.forEach((file) => {
        outputs.push(joinSafe(output, trimExt(basename(file))))
      })
    } else {
      outputs.push(output)
    }

    console.log('Decrypting files...')
    each(zip(files, outputs), (elem, cb) => {
      const inp = elem[0]
      const outp = elem[0] !== elem[1] ? elem[1] : elem[1] + '_decrypted'
      decryptFile(inp, outp, password, cb)
    }, callback)
  },
  clean: (callback) => {
    const cleanFiles = []
    // If we were encrypting we created a tmp zip file, tmpDir points there, always delete it
    if (task.encrypt) {
      cleanFiles.push(tmpDir)
    }

    // If we were asked to clean...
    if (task.clean) {
      files.forEach((file) => cleanFiles.push(file))
    }

    console.log('Cleaning...')
    each(cleanFiles, remove, callback)
  }
}

function zip (a, b, p) {
  const left = (a.length >= b.length) ? a : b
  const right = (b.length <= a.length) ? b : a
  const pad = (p !== undefined) ? p : null

  return left.map((el, idx) => [ el, (right.length > idx) ? right[idx] : pad ])
}

function getRandName () {
  return parseInt(Date.now() * (Math.random() * 10), 10)
}

// Validation and setup
// Check task
if ((task.encrypt && task.decrypt) || (!task.encrypt && !task.decrypt)) {
  console.log('Invalid task, either decrypt or encrypt')
  argParser.help()
  process.exit(1)
}

if (verbose) {
  console.log(
    'Parsed:',
    `\n\tInput path -> ${files}`,
    `\n\tOutput path -> ${output}`,
    `\n\tTask -> ${task.encrypt ? 'encrypt' : 'decrypt'}`,
    `\n\tClean -> ${task.clean}`,
    '\n\tOptions -> { algorithm: aes256 }',
    `\n\tVerbose -> ${verbose}`
  )
}

waterfall([

  acquirePass,
  task.encrypt ? tasks.encrypt : tasks.decrypt,
  tasks.clean

], (err) => {
  if (err) {
    console.log('Error:', err)
  }

  process.exit(err ? 1 : 0)
})
