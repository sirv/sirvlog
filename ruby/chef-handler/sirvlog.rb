# encoding: utf-8

require_relative '../../ruby/lib/sirvlog_client'

module SirvLog
  class SirvLog < Chef::Handler

    def initialize(config)
      @config = config

      @sirvlog = SirvlogClient.new(config)

    end

    def report

      custom = {
          "succcess" => run_status.success?,
          "node" => node.name,
          "environment" => node.chef_environment,
          "exception" => run_status.exception,
          "start_time" => run_status.start_time,
          "end_time" => run_status.end_time,
          "trace" => run_status.backtrace
      }

      if run_status.success? then
        @sirvlog.debug("Chef run SUCCESS on #{node.name}", custom);
      else
        @sirvlog.error("Chef run FAILED on #{node.name}", custom);
      end

    end
  end
end