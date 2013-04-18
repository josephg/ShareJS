for name, type of require 'ot-types'
  exports[name] = type
  try require "#{name}-api"
