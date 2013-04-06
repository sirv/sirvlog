
var sirvlog = require('../lib/sirvlog').createClient({
    'facility': 'test',
    'server': {
        'address': '127.0.0.1',
        'port': 12514
    }
});

sirvlog.on('error', function(e){
    console.log('Sirvlog error occured: ', e);
});


sirvlog.once('ready', function(){

    //sirvlog.log('big brown fox');

    sirvlog.log('big brown fox', {
        key: 'value'
    });

    sirvlog.log('big brown fox', {
        key: 'something'
    });

    /*
    console.time('yo');
    for(k=0; k<3; k++){
        sirvlog.debug('big brown fox', 'будет ли это utf8?', __filename, {
                i: k
        });
    }
    console.timeEnd('yo');
    */


});






