#!/usr/bin/env node

'use strict'
// Dependencies
const modes = { 'zip': 'zlib', 'tar': 'glib' }
const archiver = require('archiver')
const { basename } = require('upath')
const { lstatSync, createWriteStream, createReadStream } = require('fs')

function prepare (output, archiveType, archiveOptions, callback) {
  const archive = archiver(archiveType, archiveOptions)
  const out = createWriteStream(output)

  out.on('close', () => {
    if (callback) {
      callback(null)
    }
  })
  archive.pipe(out)
  archive.on('error', (err) => {
    archive.abort()
    let cb = callback
    // Avoid double calls
    callback = null
    return cb(err)
  })

  return archive
}

function addEntry (archiver, source) {
  const stat = lstatSync(source)
  if (stat) {
    if (stat.isDirectory()) {
      archiver.directory(source, basename(source))
    } else {
      // console.log('append...', createReadStream(source), source)
      archiver.file(source)
    }
  }
}

module.exports = {
  prepare: (output, type, callback) => {
    if (!callback && typeof type === 'function') {
      callback = type
      type = 'zip'
    }

    if (Object.keys(modes).indexOf(type) === -1) {
      type = 'zip'
    }

    const archive = prepare(output, type, { [modes[type]]: { level: 9 } }, callback)
    archive.addEntry = addEntry.bind(null, archive)

    return archive
  }
}
