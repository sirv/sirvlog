<?php

error_reporting(E_ALL);
ini_set("display_startup_errors",1);
ini_set("display_errors",1);

require_once('../../php5/sirvlog_client.php');

// define fallback logger, will be used if connection to sirvlog server is lost
function fallback_logger($message){
    file_put_contents('/tmp/sirvlog.log', '['.date(DATE_RFC822).'] '.$message."\n", FILE_APPEND);
}

// create sirvlog client instance
$sirvlog = new SirvlogCLient(array(
    'facility' => 'phptest',
    'server' => array(
        'address' => '127.0.0.1',
        'port' => 12514
    ),
    'fallback_logger' => 'fallback_logger',
    'backlogLimit' => 1000
));

$sirvlog->log('big brown " fox', 'будет ли это utf8?', __FILE__, __LINE__, array(
    'custom_field' => 1,
    'custom_obj' => array(
        'i' => 123
    )
));

/*
for($i=0; $i<10; $i++){

    $sirvlog->log("msg-$i");

    //for($k=0; $k<1000; $k++){
        //$sirvlog->log("msg-$i-$k");
    //}

    sleep(1);
}
*/

/*
// skip $line
$sirvlog->log('big brown fox', 'будет ли это utf8?', __FILE__, array(
    'i' => 1
));

// just message and custom
$sirvlog->log('big brown fox', array(
    'i' => 1
));
*/