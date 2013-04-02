# encoding: utf-8

#require File.expand_path('../../ruby/lib/sirvlog_client', File.dirname(__FILE__))
require_relative '../../ruby/lib/sirvlog_client'

sirvlog = SirvlogClient.new({
    "facility" => "testruby"
})

=begin
sirvlog.log("hello", "будет ли это utf8?", __FILE__, __LINE__, {
    "i" => 1
});

sirvlog.log("hello", "будет ли это utf8?", __FILE__, {
    "i" => 1
});
=end

require 'date'

a = DateTime.parse("2013-03-20T14:50:06+00:00")

#print Integer(a.to_time.to_f * 1000)

sirvlog.store({
                  'timestamp' => Integer(a.to_time.to_f * 1000),
                  'message' => 'message'
              })

