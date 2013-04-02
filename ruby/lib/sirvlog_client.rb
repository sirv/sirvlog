# encoding: utf-8

require 'json'
require 'socket'
require 'zlib'
require 'json'
require 'logger'

class SirvlogClient

  LEVEL_EMERGENCY = 0
  LEVEL_ALERT = 1
  LEVEL_CRITICAL = 2
  LEVEL_ERROR = 3
  LEVEL_WARNING = 4
  LEVEL_NOTICE = 5
  LEVEL_INFO = 6
  LEVEL_DEBUG = 7

  ENCODING_PLAIN = 0x01
  ENCODING_LZ77 = 0x02
  ENCODING_DEFLATE = 0x03


  def initialize(opts)

    @backlog = []

    @defaults = {
        'facility' => 'sirvlog', # default logging facility
        'server' => {
            'address' => '127.0.0.1',
            'port' => 12514
        },
        'fallback_logger' => {
            'file' => STDERR,
            'shift_age' => 0,
            'shift_size' => 1048576
        },
        'backlogLimit' => 512
    }

    @hostname = Socket.gethostname

    def _mergeConfigs(h1, h2)

      h2.each do |key, val|
          if h1.has_key?(key) and val.is_a?(Hash) then
              h1[key] = _mergeConfigs(h1[key], val)
          elsif !h1.has_key?(key)
            h1[key] = val
          end
        end

        return h1;

    end

    @options = _mergeConfigs(opts, @defaults);
    @connected = false
    @socket = nil

    @fallback_logger = Logger.new(@options['fallback_logger']['file'], @options['fallback_logger']['shift_age'], @options['fallback_logger']['shift_size'])

    connect

  end

  def log (message, backtrace = nil, file = nil, line = nil, custom = nil)
    return _log(SirvlogClient::LEVEL_INFO, message, backtrace, file, line, custom);
  end

  def emergency (message, backtrace = nil, file = nil, line = nil, custom = nil)
    return _log(SirvlogClient::LEVEL_EMERGENCY, message, backtrace, file, line, custom);
  end

  def alert (message, backtrace = nil, file = nil, line = nil, custom = nil)
    return _log(SirvlogClient::LEVEL_ALERT, message, backtrace, file, line, custom);
  end

  def critical (message, backtrace = nil, file = nil, line = nil, custom = nil)
    return _log(SirvlogClient::LEVEL_CRITICAL, message, backtrace, file, line, custom);
  end

  def error (message, backtrace = nil, file = nil, line = nil, custom = nil)
    return _log(SirvlogClient::LEVEL_ERROR, message, backtrace, file, line, custom);
  end

  def warning (message, backtrace = nil, file = nil, line = nil, custom = nil)
    return _log(SirvlogClient::LEVEL_WARNING, message, backtrace, file, line, custom);
  end

  def notice (message, backtrace = nil, file = nil, line = nil, custom = nil)
    return _log(SirvlogClient::LEVEL_NOTICE, message, backtrace, file, line, custom);
  end

  def info (message, backtrace = nil, file = nil, line = nil, custom = nil)
    return _log(SirvlogClient::LEVEL_INFO, message, backtrace, file, line, custom);
  end

  def debug (message, backtrace = nil, file = nil, line = nil, custom = nil)
    return _log(SirvlogClient::LEVEL_DEBUG, message, backtrace, file, line, custom);
  end

  def store (logObj)

    if !logObj['hostname']
      logObj['hostname'] = @hostname
    end

    if !logObj['facility']
      logObj['facility'] = @options['facility']
    end

    if !logObj['level']
      logObj['level'] = SirvlogClient::LEVEL_INFO
    end

    json = JSON.generate(logObj)

    if @options['backlogLimit'] then
      if @backlog.count > @options['backlogLimit'] then
        @fallback_logger.warn('backlog buffer is full, dropping message: ' + @backlog.shift)
      end
      @backlog.push(json)
    end

    if !@connected then
      if @options['backlogLimit'] < 1 then
        @fallback_logger.warn('can\'t send message (not connected), dropping: ' + json)
      end
      connect
      return
    end

    if send(json) then
      @backlog.pop
    else
      @fallback_logger.warn("Failed to send message: " + json)
      connect
    end
  end

  private

  def connect
    begin
      @socket = TCPSocket.new @options['server']['address'], @options['server']['port']

      while @backlog.count > 0 do
        json = @backlog[0]
        if send(json) then
          @backlog.shift
        else
          return
        end
      end

      @fallback_logger.debug("Connected to " + @options['server']['address'] + ':' + @options['server']['port'].to_s)
      @connected = true

    rescue Exception => e
      @fallback_logger.fatal(e.message)
    end

  end

  def _log (level, message, backtrace = nil, file = nil, line = nil, custom = nil)

    if level < SirvlogClient::LEVEL_EMERGENCY or level > SirvlogClient::LEVEL_DEBUG then
      level = SirvlogClient::LEVEL_INFO
    end

    if message.length < 1 then
      return
    end

    logObj = {
        'hostname' => @hostname,
        'facility' => @options['facility'],
        'level' => level,
        'message' => message
    }

    if custom.is_a?(Hash) then
        logObj['custom'] = custom
    end

    if line.is_a?(Fixnum) then
        logObj['line'] = line
    elsif line.is_a?(Hash)
        logObj['custom'] = line
    end

    if file.is_a?(String) and file.length > 0 then
        logObj['file'] = file
    elsif file.is_a?(Hash)
        logObj['custom'] = file
    end

    if backtrace.is_a?(String) and backtrace.length > 0 then
        logObj['backtrace'] = backtrace
    elsif backtrace.is_a?(Hash)
        logObj['custom'] = backtrace
    end

    store(logObj)

  end

  def send (message)

    dataLen = message.bytesize

    if dataLen > 65535 then
        @fallback_logger.warn('Message is too long (' + dataLen.to_s + '>65535): ' + message.slice(0, 50) + '...');
        return true
    end

    if dataLen < 512 then
        return _send(SirvlogClient::ENCODING_PLAIN, message)
    else # zlib deflate
        return _send(SirvlogClient::ENCODING_DEFLATE, Zlib::Deflate.deflate(message))
    end

  end

  def _send (encoding, message)
    messsageLen = message.bytesize

    buffer =  [encoding, messsageLen, message].pack('Cna*')

    length = 3 + messsageLen

    while true do

      # check for EOF
      begin
        @socket.read_nonblock(1)
      rescue Errno::EAGAIN
        # nothing
      rescue EOFError
        #@socket.shutdown(:RDWR)
        @socket.shutdown
        @socket.close
        @connected = false
        return false
      rescue Exception => e
        @fallback_logger.fatal(e.message)
        @connected = false
        return false
      end

      begin

        bytesWritten = @socket.send(buffer, 0)

        if bytesWritten < length then
          length -= bytesWritten
          buffer = buffer.slice(bytesWritten, length)
        else
          return true
        end

      rescue Exception => e
        @fallback_logger.fatal(e.message)
        @connected = false
        return false
      end

      return true

    end

  end

end

