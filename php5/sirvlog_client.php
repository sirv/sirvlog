<?php

class SirvlogClient
{

    private $options = null;

    private $defaults = array(
        'facility' => 'sirvlog', // default logging facility
        'server' => array(
            'address' => '127.0.0.1',
            'port' => 12514
        ),
        'fallback_logger' => 'error_log',
        'backlogLimit' => 512,
        'persistent' => true,
        'connectTimeout' => 5 // seconds
    );

    const LEVEL_EMERGENCY = 0;
    const LEVEL_ALERT = 1;
    const LEVEL_CRITICAL = 2;
    const LEVEL_ERROR = 3;
    const LEVEL_WARNING = 4;
    const LEVEL_NOTICE = 5;
    const LEVEL_INFO = 6;
    const LEVEL_DEBUG = 7;

    const ENCODING_PLAIN = 0x01;
    const ENCODING_LZ77 = 0x02;
    const ENCODING_DEFLATE = 0x03;

    private $socket = null;
    private $hostname = null;

    private $connected = false;
    private $backlog = array();


    public function log($message, $backtrace = null, $file = null, $line = null, $custom = null)
    {
        return $this->_log(SirvlogClient::LEVEL_INFO, $message, $backtrace, $file, $line, $custom);
    }

    public function emergency($message, $backtrace = null, $file = null, $line = null, $custom = null)
    {
        return $this->_log(SirvlogClient::LEVEL_EMERGENCY, $message, $backtrace, $file, $line, $custom);
    }

    public function alert($message, $backtrace = null, $file = null, $line = null, $custom = null)
    {
        return $this->_log(SirvlogClient::LEVEL_ALERT, $message, $backtrace, $file, $line, $custom);
    }

    public function critical($message, $backtrace = null, $file = null, $line = null, $custom = null)
    {
        return $this->_log(SirvlogClient::LEVEL_CRITICAL, $message, $backtrace, $file, $line, $custom);
    }

    public function error($message, $backtrace = null, $file = null, $line = null, $custom = null)
    {
        return $this->_log(SirvlogClient::LEVEL_ERROR, $message, $backtrace, $file, $line, $custom);
    }

    public function warning($message, $backtrace = null, $file = null, $line = null, $custom = null)
    {
        return $this->_log(SirvlogClient::LEVEL_WARNING, $message, $backtrace, $file, $line, $custom);
    }

    public function notice($message, $backtrace = null, $file = null, $line = null, $custom = null)
    {
        return $this->_log(SirvlogClient::LEVEL_NOTICE, $message, $backtrace, $file, $line, $custom);
    }

    public function info($message, $backtrace = null, $file = null, $line = null, $custom = null)
    {
        return $this->_log(SirvlogClient::LEVEL_INFO, $message, $backtrace, $file, $line, $custom);
    }

    public function debug($message, $backtrace = null, $file = null, $line = null, $custom = null)
    {
        return $this->_log(SirvlogClient::LEVEL_DEBUG, $message, $backtrace, $file, $line, $custom);
    }

    // ----------- public functions end --------------- //

    function __construct($opts)
    {

        $this->hostname = gethostname();

        $_mergeConfigs = function($arr1, $arr2)use(&$_mergeConfigs)
        {
            foreach ($arr2 as $key => $value) {
                if (array_key_exists($key, $arr1) && is_array($value)) {
                    $arr1[$key] = $_mergeConfigs($arr1[$key], $arr2[$key]);
                } else if (!array_key_exists($key, $arr1)) {
                    $arr1[$key] = $value;
                }
            }
            return $arr1;
        };

        $this->options = $_mergeConfigs($opts, $this->defaults);

        register_shutdown_function(array($this, 'shutdown'));

        $this->connect();
    }

    public function shutdown()
    {
        foreach ($this->backlog as $json) {
            if ($this->connected) {
                if (!$this->send($json)) {
                    $this->log_fallback('Undelivered message: ' . $json);
                }
            } else {
                $this->log_fallback('Undelivered message: ' . $json);
            }
        }

    }

    private function log_fallback($message)
    {
        $message = 'SirvlogClient: ' . $message;

        if ($this->options['fallback_logger'] && function_exists($this->options['fallback_logger'])) {
            call_user_func($this->options['fallback_logger'], $message);
        } else {
            error_log($message);
        }
    }

    private function connect()
    {

        $errno = 0;
        $errstr = '';

        $opts = STREAM_CLIENT_CONNECT;

        if ($this->options['persistent']) {
            $opts |= STREAM_CLIENT_PERSISTENT;
        }

        $this->socket = @stream_socket_client($this->options['server']['address'] . ':' . $this->options['server']['port'], $errno, $errstr,
            $this->options['connectTimeout'], $opts);

        if (!$this->socket) {
            $this->log_fallback('Failed to connect to server: ' . $errstr);
            return;
        }

        while(count($this->backlog)){
            $json = $this->backlog[0];
            if ($this->send($json)) {
                array_shift($this->backlog);
            } else {
                return;
            }
        }

        $this->connected = true;
    }

    private function _send($encoding, $message)
    {

        $messsageLen = strlen($message);

        $buffer = pack('Cna*', $encoding, $messsageLen, $message);

        $length = 3 + $messsageLen;

        while (1) {

            if (feof($this->socket)) { // server closed connection
                @stream_socket_shutdown($this->socket, STREAM_SHUT_RDWR);
                @fclose($this->socket);
                $this->socket = null;
                $this->connected = false;
                return false;
            }

            $bytesWritten = @fwrite($this->socket, $buffer);
            if (!$bytesWritten) {
                return false;
            }
            if ($bytesWritten < $length) {
                $buffer = substr($buffer, $bytesWritten);
                $length -= $bytesWritten;
            } else {
                return true;
            }
        }

        return true;
    }

    private function send($message)
    {

        $dataLen = strlen($message);

        if ($dataLen > 65535) {
            $this->log_fallback('Message is too long (' . $dataLen . '>65535): ' . substr($message, 0, 50) . '...');
            return true;
        }

        if ($dataLen < 512) {
            return $this->_send(SirvlogClient::ENCODING_PLAIN, $message);

        } else { // zlib deflate
            return $this->_send(SirvlogClient::ENCODING_DEFLATE, gzcompress($message));
        }

    }

    public function _log($level, $message, $backtrace, $file, $line, $custom)
    {
        switch(strtolower($level)){
            case 'emergency':
                $level = SirvlogClient::LEVEL_EMERGENCY;
                break;
            case 'alert':
                $level = SirvlogClient::LEVEL_ALERT;
                break;
            case 'critical':
                $level = SirvlogClient::LEVEL_CRITICAL;
                break;
            case 'error':
                $level = SirvlogClient::LEVEL_ERROR;
                break;
            case 'warning':
                $level = SirvlogClient::LEVEL_WARNING;
                break;
            case 'notice':
                $level = SirvlogClient::LEVEL_NOTICE;
                break;
            case 'info':
                $level = SirvlogClient::LEVEL_INFO;
                break;
            case 'debug':
                $level = SirvlogClient::LEVEL_DEBUG;
                break;
        }

        if ($level < SirvlogClient::LEVEL_EMERGENCY || $level > SirvlogClient::LEVEL_DEBUG) $level = SirvlogClient::LEVEL_INFO;

        if ($message == '') return;

        $logObj = array(
            'hostname' => $this->hostname,
            'facility' => $this->options['facility'],
            'level' => $level,
            'message' => $message
        );

        if (is_array($custom)) {
            $logObj['custom'] = $custom;
        }

        if (is_numeric($line)) {
            $logObj['line'] = $line;
        } else if (is_array($line)) {
            $logObj['custom'] = $line;
        }

        if (is_string($file) && $file != '') {
            $logObj['file'] = $file;
        } else if (is_array($file)) {
            $logObj['custom'] = $file;
        }

        if (is_string($backtrace) && $backtrace != '') {
            $logObj['backtrace'] = $backtrace;
        } else if (is_array($backtrace)) {
            $logObj['custom'] = $backtrace;
        }

        //$json = json_encode($logObj, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $json = json_encode($logObj);

        if ($this->options['backlogLimit']) {
            if (count($this->backlog) > $this->options['backlogLimit']) {
                $this->log_fallback('backlog buffer is full, dropping message: ' . array_shift($this->backlog));
            }
            $this->backlog[] = $json;

        }

        if (!$this->connected) {
            if (!$this->options['backlogLimit']) {
                $this->log_fallback('can\'t send message (not connected), dropping: ' . $json);
            }
            $this->connect();
            return;
        }

        if ($this->send($json)) {
            array_pop($this->backlog);
        } else {
            $this->connect();
        }

    }

}



