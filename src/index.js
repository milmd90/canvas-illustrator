$( document ).ready(function() {
    var $window = $( window );
    var $body = $('body');
    var $canvas = $('canvas');


    var shift = false;
    $body.on('keydown keyup',function(e){
        var stepSize = 5;
        if (e.type==="keydown") {
            if (shift) {
                if (e.which===38) {
                    Camera.z *= .95;
                } else if (e.which===40) {
                    Camera.z *= 1.05;
                }
            } else {
                if (e.which===39) {
                    Camera.x += stepSize;
                } else if (e.which===37) {
                    Camera.x -= stepSize;
                } else if (e.which===40) {
                    Camera.y += stepSize;
                } else if (e.which===38) {
                    Camera.y -= stepSize;
                }
            }
            UpdateRender();
        }
    });

    $body.on('keydown',function(e){
        if (e.which === 16) {
            shift = true;
        }
    });
    $body.on('keyup',function(e){
        if (e.which === 16) {
            shift = false;
        }
    });

    $canvas
        .mousedown(function(e) {
            var init_x = e.pageX;
            var init_y = e.pageY;
            var c_x = Camera.x;
            var c_y = Camera.y;

            $window.mousemove(function(e) {
                Camera.x = c_x + (init_x - e.pageX);
                Camera.y = c_y + (init_y - e.pageY);
                UpdateRender();
            });

            return false;
        })
        .mouseup(function() {
            $window.unbind("mousemove");
            return false;
        });

    Init();
    MakePoster();
    UpdateRender();
    // ContRender();

    // Create hi res image
    // var imgData = document.getElementById('canvas').toDataURL("image/jpeg", 1.0);
    // document.getElementById('canvas').style.display = "none";
    // $('#image').html('<img src="'+imgData+'" width="800px"/>');

});
