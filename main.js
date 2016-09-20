#!/usr/bin/env node

'use strict'
// Dependencies
const fs = require('fs-extra')
const os = require('os')
const async = require('async')
const upath = require('upath')
const prompt = require('prompt')
const archiver = require('archiver')
const encryptor = require('file-encryptor')

const argParser = require(upath.join(__dirname, 'args'))
// Variables
let { files, output, task, verbose } = argParser.parse(process.argv)
let outDir = output[ 0 ] || upath.joinSafe(process.cwd() + '/data')
let tmpDir = null
let password = null
let cleanFiles = []
const options = { algorithm: 'aes256' }

// Get stats
files = files.map(f => ({ path: f, stat: fs.lstatSync(f) }))

const logger = {
  log: function () {
    console.log.apply(console, Array.prototype.slice.call(arguments, 0))
  },
  verbose: function () {
    if (verbose) {
      console.log.apply(console, Array.prototype.slice.call(arguments, 0))
    }
  }
}

// Validation and setup
// Check task and files correct
if ((task.encrypt && task.decrypt) || (!task.encrypt && !task.decrypt)) {
  logger.log('Invalid task, either decrypt or encrypt')
  argParser.help()
  process.exit(1)
}

logger.log(
  'Parsed:',
  `\n\tInput path -> ${files.map(f => f.path)}`,
  `\n\tOutput path -> ${outDir}`,
  `\n\tTask -> ${task.encrypt ? 'encrypt' : 'decrypt'}`,
  `\n\tClean -> ${task.clean}`,
  '\n\tOptions ->', options,
  `\n\tVerbose -> ${verbose}`
)

var getRandName = function () {
  return parseInt(Date.now() * (Math.random() * 10), 10)
}

function getName (str) {
  return str.split('/').pop()
}

function getList (file, submitCb, callback) {
  logger.verbose('parsing ->', file.path)
  let stat = file.stat || fs.lstatSync(file.path)
  if (!stat) {
    return callback()
  }
  // If it is a file, submit it and skip from list
  if (!stat.isDirectory()) {
    submitCb(file)
    callback(null, file)
  } else {
    // Skip directories in
    logger.verbose(`list -> ${file.path}`)
    fs.readdir(file.path, (err, list) => {
      if (err) {
        logger.verbose(`errored readdir ${file.path} -> ${err}`)
        return callback(err)
      }
      logger.verbose(`\tlist elems -> ${list.length}`)
      // Setup path for archiver
      list = list.map(l => ({ path: upath.join(file.path, l), virtualPath: upath.join(file.virtualPath, l) }))
      // logger.verbose('got list post', list)
      async.each(list, (file, cb) => { getList(file, submitCb, cb) }, callback)
    })
  }
}

function compressSources (sources, output, callback) {
  let out = fs.createWriteStream(output)
  let archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } })

  out.on('close', callback)
  archive.pipe(out)
  archive.on('error', (err) => {
    console.log('archiver errored', err)
    archive.abort()
    let cb = callback
    callback = () => {}
    return cb(err)
  })

  if (sources.length < 2) {
    archive.bulk({ expand: true, src: ['**/*.*', '*.*'], cwd: upath.normalize(sources[ 0 ].path + '/') })
    archive.finalize()
  } else {
    async.each(sources, (source, cb) => {
      let dir = { path: source.path, virtualPath: getName(source.path), stat: source.stat || null }
      getList(dir, (file) => {
        logger.verbose(`append -> ${file.path} as ${file.virtualPath}`)
        let stream = fs.createReadStream(file.path)
        archive.append(stream, { name: file.virtualPath })
      }, cb)
    }, (err) => {
      if (err) {
        console.log('Compressing error', err)
      }
      archive.finalize()
    })
  }
}

function processFile (processCb, inputFile, outputFile, password, options, callback) {
  logger.verbose('Working...',
    `\n\tInput file -> ${inputFile}`,
    `\n\tOutput file -> ${outputFile}`,
    `\n\tTask -> ${task.encrypt ? 'encrypt' : 'decrypt'}`,
    `\n\tPassword -> ${password}`,
    '\n\tOptions ->', options
  )
  processCb(inputFile, outputFile, password, options, function (err) {
    if (err) {
      logger.log('There was an error during the task ->', err)
      callback(err)
    } else {
      logger.log('Done')
      callback(null)
    }
  })
}

function encryptFile (inputPath, outputPath, password, callback) {
  processFile(encryptor.encryptFile, inputPath, outputPath, password, options, callback)
}

function decryptFile (inputPath, outputPath, password, callback) {
  processFile(encryptor.decryptFile, inputPath, outputPath, password, options, callback)
}

async.waterfall([

  // Acquire password
  (callback) => {
    prompt.start()
    prompt.get([{

      name: 'password',
      hidden: true,
      replace: '*',
      required: true

    }], callback)
  },
  // Compress or pass
  (result, callback) => {
    password = result.password

    // If we are encrypting and it is a directory or multiple files we need a zip a file
    if (task.encrypt && (files.length > 1 || files[0].stat.isDirectory())) {
      logger.log('Compressing sources...')
      tmpDir = upath.joinSafe(os.tmpDir(), getRandName() + '.tar.gz')
      compressSources(files, tmpDir, callback)
    } else {
      tmpDir = files[ 0 ].path
      callback(null)
    }
  },
  // Process
  (callback) => {
    if (task.encrypt) {
      logger.log('Done')
      logger.log('Encrypting file...', tmpDir)
      // Setup outputPath
      outDir = upath.addExt(outDir, 'enc')
      encryptFile(tmpDir, outDir, password, callback)
    } else {
      // Try to guess extension from file, if we are not able,
      // as we always tar.gz folders on ecryption, let it be a tar.gz

      // we had a **.enc file
      if (outDir.indexOf('.enc') === (outDir.length - 4)) {
        outDir = upath.trimExt(outDir)
      }
      // If we trim again and the path dimishes, then we had another extension, otherwise add ours
      if (outDir === upath.trimExt(outDir)) {
        outDir = upath.addExt(outDir, 'tar.gz')
      }// else We had another extension, good to go

      logger.log('Decrypting files...')
      async.each(files, (file, cb) => {
        decryptFile(file.path, outDir, password, cb)
      }, callback)
    }
  },
  // Setup and clean files
  (callback) => {
    // If we were encrypting we created a tmp zip file, tmpDir points there, always delete it
    if (task.encrypt) {
      cleanFiles.push(tmpDir)
    }

    // If we were asked to clean...
    if (task.clean) {
      cleanFiles = cleanFiles.concat(files.map(f => f.path))
    }

    logger.log('Cleaning...')
    async.each(cleanFiles, fs.remove, callback)
  }

  // End
], (err) => {
  if (err) {
    logger.log('Errored', err)
  } else {
    logger.log('Done!! Good to go')
    logger.log('Your files are in', outDir)
  }
})
