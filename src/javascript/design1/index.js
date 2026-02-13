const right = "Right";
const left = "Left";
const cellSize = scale / 16;
const squareLine = cellSize / 100;
const arcLine = cellSize / 10;

var Squares = [];
var Arcs = [];
var cursor;
var dir;
var onThe;

function MakePoster() {
    cursor = {
        x:-1,
        y:-1,
    };
    dir = 3;
    onThe = right;
    var levels = 2;

    MakeBackground();
    Stem(levels);
    Stem(levels);
    Stem(levels);
    Stem(levels);
}

function Stem(level) {
    if (level) {
        HalfStem();
        Leaf();
        Stem(level-1);
        Leaf();
        HalfStem();
    } else {
        Leaf();
    }
}

function MakeBackground() {
    var numWide = CanvasWidth / cellSize;
    var numHigh = CanvasHeight / cellSize;

    for (var x = 0; x < numWide; x++) {
        var x1 = cellSize * x;
        var x2 = cellSize * (x+1);
        for (var y = 0; y < numHigh; y++) {
            var y1 = cellSize * y;
            var y2 = cellSize * (y+1);
            Squares.push({
                points: [
                    { x:x1, y:y1 },
                    { x:x2, y:y1 },
                    { x:x2, y:y2 },
                    { x:x1, y:y2 },
                ],
            });
        }
    }
}




function Render() {

    // Render background

    BackContextHandle.lineWidth = squareLine / Camera.z;
    var min = {R:133, G:197, B:144};
    var max = {R:200, G:200, B:200};
    var rand = 10;

    $.each(Squares, function(i, image) {
        var p =image.points[0];
        var h = (CanvasHeight - p.y) / CanvasHeight;
        var fill = {
            R:Math.floor(max.R * h - min.R * (h - 1)) - Math.floor(Math.random() * h * rand),
            G:Math.floor(max.G * h - min.G * (h - 1)) - Math.floor(Math.random() * h * rand),
            B:Math.floor(max.B * h - min.B * (h - 1)) - Math.floor(Math.random() * h * rand),
        };
        var newImage = {
            fill: fill
        };
        newImage.points = image.points.map(function(point) {
            return {
                x: point.x / Camera.z - Camera.x,
                y: point.y / Camera.z - Camera.y,
            };
        });
        RenderImage(newImage);
    });

    // Render design

    var len = Arcs.length;
    var cStep = 256 / Arcs.length;
    var pi2 = 2 * Math.PI;
    var min = {R:180, G:180, B:180};
    var max = {R:255, G:255, B:255};

    $.each(Arcs, function(i, arc) {

        var x = (arc.x * cellSize + CenterX) / Camera.z - Camera.x;
        var y = (arc.y * cellSize + CenterY) / Camera.z - Camera.y;
        var r = cellSize/2 / Camera.z;

        // White outline
        BackContextHandle.lineWidth = 3*arcLine / Camera.z;
        BackContextHandle.strokeStyle = "white";

        BackContextHandle.beginPath();
        BackContextHandle.arc(x, y, r, arc.start, arc.end);
        BackContextHandle.stroke();

        // Color arc
        BackContextHandle.lineWidth = arcLine / Camera.z;
        var fill = {
            R:Math.floor(((max.R - min.R)/2) * (Math.cos(pi2 * ((2*i+time)/len + 1/4)) + 1) + min.R),
            G:Math.floor(((max.G - min.G)/2) * (Math.cos(pi2 * ((i+time)/len + 0/4)) + 1) + min.G),
            B:Math.floor(((max.B - min.B)/2) * (Math.cos(pi2 * ((i+time)/len + 2/4)) + 1) + min.B),
        };
        BackContextHandle.strokeStyle = RGBToString(fill);

        BackContextHandle.beginPath();
        BackContextHandle.arc(x, y, r, arc.start, arc.end);
        BackContextHandle.stroke();

    });
}

function RenderImage(image) {
    var ctx = BackContextHandle;

    // Set color
    var fill = image.fill;
    if (fill !== undefined) {
        ctx.fillStyle = RGBToString(fill);
    } else {
        ctx.fillStyle = "white";
    }

    // Set line color
    var line = image.line;
    if (line !== undefined) {
        ctx.strokeStyle = RGBToString(line);
    } else {
        ctx.strokeStyle = "white";
    }

    // Draw from point to point
    var points = image.points;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.lineTo(points[3].x, points[3].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function RGBToString(obj) {
    return "rgb(" + obj.R + "," + obj.G + "," + obj.B + ")";
}




function Leaf() {
    turnRight();
    turnLeft();
    circleRight();
    turnLeft();
    circleRight();
    turnLeft();
    circleRight();
    turnLeft();
    turnRight();
    turnLeft();

}

function HalfStem() {
    turnRight();
    turnLeft();
    circleRight();
    turnLeft();
    turnRight();
    turnLeft();
}

function circleRight() {
    turnRight();
    turnRight();
    turnRight();
    turnRight();
}

function circleLeft() {
    turnLeft();
    turnLeft();
    turnLeft();
    turnLeft();
}

function turnRight() {
    if (onThe == right) {
        hopRight();
    }

    Arcs.push({
        x: cursor.x,
        y: cursor.y,
        start: .5*(dir-1)*Math.PI,
        end: .5*dir*Math.PI,
    });
    dir = (dir+1)%4;
}

function turnLeft() {
    if (onThe == left) {
        hopLeft();
    }

    Arcs.push({
        x: cursor.x,
        y: cursor.y,
        start: .5*dir*Math.PI,
        end: .5*(dir+1)*Math.PI,
    });
    dir = (dir+3)%4;
}

function hopRight() {
    var n = dirToCord(dir+1);
    cursor = {
        x:cursor.x + n.x,
        y:cursor.y + n.y,
    };
    onThe = left;
}

function hopLeft() {
    var n = dirToCord(dir-1);
    cursor = {
        x:cursor.x + n.x,
        y:cursor.y + n.y,
    };
    onThe = right;
}

function dirToCord(dir) {
    switch ((dir+4)%4) {
        case 0:
            return {x:1, y:0};
        case 1:
            return {x:0, y:1};
        case 2:
            return {x:-1, y:0};
        case 3:
            return {x:0, y:-1};
        default:
            console.log("Error: dirToCord "+ dir%4);
    }
}
