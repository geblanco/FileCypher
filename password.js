'use strict'

const prompt = require('prompt')

module.exports = (msg, callback) => {
  if (!callback && typeof msg === 'function') {
    callback = msg
    msg = ''
  }
  prompt.message = msg
  prompt.start()
  prompt.get([{

    name: 'password',
    hidden: true,
    replace: '*',
    required: true

  }], (err, res) => {
    if (err) {
      return callback(err)
    }
    callback(null, res.password)
  })
}
