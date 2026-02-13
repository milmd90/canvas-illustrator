var DirectoryMap = null;
var TreeNodes = [];
var TreeEdges = [];
var LayoutBounds = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
var LoadStatus = "loading"; // "loading" | "parsing" | "ready" | "error"
var MaxNodes = 15000;      // cap nodes so huge trees don't freeze the UI
var TruncatedMessage = null; // set if tree was capped

function MakePoster() {
    TreeNodes = [];
    TreeEdges = [];
    TruncatedMessage = null;
    if (!DirectoryMap) return;

    var nodeList = [];
    var edgeList = [];
    var nodeCount = 0;
    function walk(obj, parentId, depth, path) {
        if (nodeCount >= MaxNodes) return;
        var keys = Object.keys(obj);
        keys.forEach(function (key, index) {
            if (nodeCount >= MaxNodes) return;
            var id = path ? path + "/" + key : key;
            var val = obj[key];
            var isDir = val !== null && typeof val === "object";
            nodeList.push({
                id: id,
                name: key,
                type: isDir ? "dir" : "file",
                depth: depth,
                indexInParent: index,
                siblingCount: keys.length,
            });
            nodeCount += 1;
            if (parentId) edgeList.push({ from: parentId, to: id });
            if (isDir) walk(val, id, depth + 1, id);
        });
    }
    walk(DirectoryMap, null, 0, "");

    if (nodeList.length === 0) return;

    var nodeById = {};
    nodeList.forEach(function (n) {
        n.children = [];
        nodeById[n.id] = n;
    });
    edgeList.forEach(function (e) {
        nodeById[e.from].children.push(nodeById[e.to]);
    });

    var maxDepth = 0;
    nodeList.forEach(function (n) { maxDepth = Math.max(maxDepth, n.depth); });
    var yStep = maxDepth > 0 ? 1 / maxDepth : 1;

    var xCursor = 0;
    function layout(node) {
        node.y = node.depth * yStep;
        if (node.children.length === 0) {
            node.x = xCursor;
            xCursor += 1;
            return;
        }
        node.children.forEach(layout);
        node.x = (node.children[0].x + node.children[node.children.length - 1].x) / 2;
    }
    var roots = nodeList.filter(function (n) { return n.depth === 0; });
    roots.forEach(layout);

    var xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    nodeList.forEach(function (n) {
        xMin = Math.min(xMin, n.x);
        xMax = Math.max(xMax, n.x);
        yMin = Math.min(yMin, n.y);
        yMax = Math.max(yMax, n.y);
    });
    var xRange = xMax - xMin || 1;
    nodeList.forEach(function (n) {
        n.x = (n.x - xMin) / xRange;
        n.y = n.y;
    });
    var margin = 0.05;
    LayoutBounds = { xMin: -margin, xMax: 1 + margin, yMin: -margin, yMax: 1 + margin };

    TreeNodes = nodeList;
    TreeEdges = edgeList;
    TruncatedMessage = nodeCount >= MaxNodes ? "Showing first " + MaxNodes + " nodes" : null;
}

function toScreen(x, y) {
    var w = CanvasWidth / Camera.z;
    var h = CanvasHeight / Camera.z;
    var bx = LayoutBounds.xMax - LayoutBounds.xMin || 1;
    var by = LayoutBounds.yMax - LayoutBounds.yMin || 1;
    var sx = (-Camera.x) + (x - LayoutBounds.xMin) / bx * w;
    var sy = (-Camera.y) + (y - LayoutBounds.yMin) / by * h;
    return { x: sx, y: sy };
}

function Render() {
    BackContextHandle.fillStyle = "#1a1a2e";
    BackContextHandle.fillRect(-Camera.x, -Camera.y, CanvasWidth / Camera.z, CanvasHeight / Camera.z);

    if (TreeNodes.length === 0) {
        BackContextHandle.fillStyle = "#eee";
        BackContextHandle.font = "16px sans-serif";
        BackContextHandle.textAlign = "center";
        var msg = LoadStatus === "parsing" ? "Parsing directory_map.json…" : LoadStatus === "error" ? "Failed to load directory_map.json" : "Loading directory_map.json…";
        BackContextHandle.fillText(msg, CanvasWidth / Camera.z / 2 - Camera.x, CanvasHeight / Camera.z / 2 - Camera.y);
        return;
    }

    var nodeById = {};
    TreeNodes.forEach(function (n) { nodeById[n.id] = n; });

    BackContextHandle.lineCap = "round";
    BackContextHandle.lineJoin = "round";

    var lineW = Math.max(1, 2 / Camera.z);
    var nodeR = Math.max(3, 12 / Camera.z);
    var fontPx = Math.max(10, 14 / Camera.z);

    BackContextHandle.lineWidth = lineW;
    BackContextHandle.strokeStyle = "rgba(120,180,220,0.6)";
    TreeEdges.forEach(function (e) {
        var from = nodeById[e.from];
        var to = nodeById[e.to];
        if (!from || !to) return;
        var p1 = toScreen(from.x, from.y);
        var p2 = toScreen(to.x, to.y);
        BackContextHandle.beginPath();
        BackContextHandle.moveTo(p1.x, p1.y);
        BackContextHandle.lineTo(p2.x, p2.y);
        BackContextHandle.stroke();
    });

    BackContextHandle.font = fontPx + "px sans-serif";
    BackContextHandle.textAlign = "center";
    BackContextHandle.textBaseline = "middle";

    TreeNodes.forEach(function (n) {
        var p = toScreen(n.x, n.y);
        var isDir = n.type === "dir";
        BackContextHandle.beginPath();
        BackContextHandle.arc(p.x, p.y, nodeR, 0, 2 * Math.PI);
        BackContextHandle.fillStyle = isDir ? "rgba(100,180,255,0.9)" : "rgba(200,220,180,0.9)";
        BackContextHandle.fill();
        BackContextHandle.strokeStyle = "rgba(255,255,255,0.8)";
        BackContextHandle.lineWidth = lineW;
        BackContextHandle.stroke();
        BackContextHandle.fillStyle = "#fff";
        BackContextHandle.fillText(n.name, p.x, p.y + nodeR + fontPx * 0.6);
    });
    if (TruncatedMessage) {
        BackContextHandle.fillStyle = "rgba(255,255,255,0.8)";
        BackContextHandle.font = (12 / Camera.z) + "px sans-serif";
        BackContextHandle.textAlign = "left";
        BackContextHandle.fillText(TruncatedMessage, -Camera.x + 8, -Camera.y + CanvasHeight / Camera.z - 16);
    }
}

$(function () {
    $.ajax({
        url: "javascript/design3/directory_map.json",
        dataType: "text",
        timeout: 0,
        success: function (text) {
            LoadStatus = "parsing";
            UpdateRender();
            setTimeout(function () {
                try {
                    DirectoryMap = JSON.parse(text);
                    MakePoster();
                    LoadStatus = "ready";
                    UpdateRender();
                } catch (e) {
                    console.error("Failed to parse directory_map.json", e);
                    LoadStatus = "error";
                    UpdateRender();
                }
            }, 0);
        },
        error: function (xhr, status, err) {
            console.error("Failed to load directory_map.json", status, err);
            LoadStatus = "error";
            UpdateRender();
        }
    });
});
