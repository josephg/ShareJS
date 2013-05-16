for name, type of require 'ottypes'
  exports[name] = type
  try require "#{name}-api"
