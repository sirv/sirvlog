# encoding: utf-8

require_relative './sirvlog_client'

require "logstash/outputs/base"
require "logstash/namespace"

require 'date'
require 'socket'

class LogStash::Outputs::Sirvlog < LogStash::Outputs::Base

  config_name "sirvlog"
  plugin_status "beta"

  # sirvlog host
  config :host, :validate => :string, :required => true

  # sirvlog port
  config :port, :validate => :number, :default => 12514

  # facility
  config :facility, :validate => :string, :required => true

  # format
  config :format, :validate => :string

  # log level
  config :level, :validate => :number, :default => 6

  public
  def register

    config = {
        'facility' => @facility,
        'server' => {
            'address' => @host,
            'port' => @port
        }
    }

    @sirvlog = SirvlogClient.new(config)

  end # def register

  public
  def receive(event)
    return unless output?(event)

    message = event.fields.to_hash.values.join(' ')

    if @format == "web" && event.fields['request']
      message = event.fields['request']
    end

    #@sirvlog.log(message, event.to_hash);

    @sirvlog.store({
        'timestamp' => Integer(DateTime.parse(event.timestamp).to_time.to_f * 1000),
        'message' => message,
        'custom' => event.to_hash,
        'level' => @level
    })

  end # def receive
end