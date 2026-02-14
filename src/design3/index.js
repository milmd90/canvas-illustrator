/**
 * Design3: Directory Tree Visualization
 * 
 * Visualizes a directory structure from directory_map.json as a hierarchical tree.
 * Features:
 * - Top-down tree layout (root at top, children below)
 * - Color gradient by depth level (blue -> purple -> red)
 * - Non-overlapping node spacing
 * - Dots only (no labels) for clean presentation
 */

// ============================================================================
// GLOBAL STATE VARIABLES
// ============================================================================

/** The parsed JSON directory map structure */
var DirectoryMap = null;

/** Array of all tree nodes with layout positions (x, y) and metadata */
var TreeNodes = [];

/** Array of edges connecting parent to child nodes: { from: nodeId, to: nodeId } */
var TreeEdges = [];

/** Bounding box for the tree layout in normalized coordinates (0-1) */
var LayoutBounds = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

/** Current loading state: "loading" | "parsing" | "ready" | "error" */
var LoadStatus = "loading";

/** Maximum number of nodes to render (prevents UI freeze on huge trees) */
var MaxNodes = 1000000;

/** Message to display if tree was truncated (null if not truncated) */
var TruncatedMessage = null;

// World rotation (radians) for animation
var WorldRotation = 0;
// Angular speed: one full rotation every 3 seconds
var AngularSpeed = Math.PI * 2 / 3; // radians per second
var LastRenderTime = null; // ms

/**
 * MakePoster() - Builds the tree visualization from DirectoryMap
 * 
 * This function:
 * 1. Walks the directory structure to create nodes and edges
 * 2. Builds parent-child relationships
 * 3. Calculates layout positions (x, y) for each node
 * 4. Normalizes coordinates to fit the canvas
 * 
 * Called once after DirectoryMap is loaded.
 */
function MakePoster() {
    // Reset state
    TreeNodes = [];
    TreeEdges = [];
    TruncatedMessage = null;
    if (!DirectoryMap) return;

    // ========================================================================
    // STEP 1: Parse directory structure into nodes and edges
    // ========================================================================
    var nodeList = [];
    var edgeList = [];
    var nodeCount = 0;
    
    /**
     * Recursively walks the directory tree structure
     * @param {Object} obj - Current directory object from JSON
     * @param {string|null} parentId - ID of parent node (null for root)
     * @param {number} depth - Current depth level (0 = root)
     * @param {string} path - Full path string for this node
     */
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
    // Start walking from root
    walk(DirectoryMap, null, 0, "");

    if (nodeList.length === 0) return;

    // ========================================================================
    // STEP 2: Build parent-child relationships
    // ========================================================================
    var nodeById = {};
    // Initialize children arrays and create lookup map
    nodeList.forEach(function (n) {
        n.children = [];
        nodeById[n.id] = n;
    });
    // Populate children arrays from edge list
    edgeList.forEach(function (e) {
        nodeById[e.from].children.push(nodeById[e.to]);
    });

    // ========================================================================
    // STEP 3: Simple 3D radial layout
    // - Use first N levels if desired (here use full depth)
    // - Compute leaf counts and allocate angular spans per subtree
    // - Each node gets a radius: rootRadius, childRadius = parentRadius * 0.66
    // - Each node is placed along its subtree angle at increasing radial distance so
    //   children are always radially further from the center than their parent.
    // - Add a small z offset per depth; render with perspective projection.
    // ========================================================================
    // compute maxDepth
    var maxDepth = 0;
    nodeList.forEach(function (n) { maxDepth = Math.max(maxDepth, n.depth); });

    // Compute subtree leaf counts
    function computeLeafCount(node) {
        if (!node.children || node.children.length === 0) { node.leafCount = 1; return 1; }
        var sum = 0;
        node.children.forEach(function(c){ sum += computeLeafCount(c); });
        node.leafCount = sum;
        return sum;
    }
    // Prepare nodeById and ensure children arrays
    nodeById = {};
    nodeList.forEach(function(n){ n.children = n.children || []; nodeById[n.id] = n; });
    // find roots
    var roots = nodeList.filter(function(n){ return n.depth === 0; });
    if (roots.length === 0) roots = [nodeList[0]];
    var totalLeaves = 0;
    roots.forEach(function(r){ totalLeaves += computeLeafCount(r); });
    totalLeaves = Math.max(1, totalLeaves);

    // assign angular spans proportional to leaf counts
    var anglePerLeaf = (2 * Math.PI) / totalLeaves;
    var angleCursor = 0;
    function assignAngles(node) {
        if (!node.children || node.children.length === 0) {
            node.angle = angleCursor + anglePerLeaf * 0.5;
            angleCursor += anglePerLeaf;
            return;
        }
        // sort children by indexInParent to keep order
        node.children.sort(function(a,b){ return (a.indexInParent||0)-(b.indexInParent||0); });
        node.children.forEach(assignAngles);
        // node angle = weighted average of children angles
        var sx = 0, sy = 0;
        node.children.forEach(function(c){ var w = c.leafCount||1; sx += Math.cos(c.angle)*w; sy += Math.sin(c.angle)*w; });
        node.angle = Math.atan2(sy, sx);
    }
    roots.forEach(assignAngles);

    // radii: root radius and scaling
    var rootRadius = 0.06; // normalized units
    var radiusScale = 0.66;
    var padding = 0.04; // extra gap between spheres (increased for less overlap)
    var zStep = 0.03; // increase in world z per depth

    // set radii and distances from center
    function setPositions(node, parent) {
        if (!parent) {
            node.radius = rootRadius;
            node.dist = 0;
            node.z = 0;
        } else {
            node.radius = parent.radius * radiusScale;
            node.dist = parent.dist + parent.radius + node.radius + padding;
            node.z = parent.z + zStep;
        }
        // position in world XY
        var a = node.angle || 0;
        node.wx = 0.5 + node.dist * Math.cos(a);
        node.wy = 0.5 + node.dist * Math.sin(a);
        // set children
        (node.children||[]).forEach(function(c){ setPositions(c, node); });
    }
    roots.forEach(function(r){ setPositions(r, null); });

    // After world positions, compute perspective-projected normalized positions and store projection params
    var f = 0.9; // focal length (normalized)
    nodeList.forEach(function(n){
        var wz = n.z || 0;
        var scale = f / (f + wz);
        n.projScale = scale;
        n.x = 0.5 + (n.wx - 0.5) * scale;
        n.y = 0.5 + (n.wy - 0.5) * scale;
        n.projRadius = (n.radius || 0) * scale; // normalized
    });

    // compute bounds from projected coords
    var xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    nodeList.forEach(function(n){ xMin = Math.min(xMin, n.x - n.projRadius); xMax = Math.max(xMax, n.x + n.projRadius); yMin = Math.min(yMin, n.y - n.projRadius); yMax = Math.max(yMax, n.y + n.projRadius); });
    var margin = 0.03;
    LayoutBounds = { xMin: xMin - margin, xMax: xMax + margin, yMin: yMin - margin, yMax: yMax + margin };

    // Store results
    TreeNodes = nodeList;
    TreeEdges = edgeList;
    TruncatedMessage = nodeCount >= MaxNodes ? "Showing first " + MaxNodes + " nodes" : null;
}

/**
 * Converts normalized coordinates (0-1) to screen pixel coordinates
 * Accounts for camera zoom and pan, and layout bounds
 * 
 * @param {number} x - Normalized x coordinate (0-1)
 * @param {number} y - Normalized y coordinate (0-1)
 * @returns {Object} Screen coordinates: { x: pixelX, y: pixelY }
 */
function toScreen(x, y) {
    // Canvas dimensions adjusted for zoom
    var w = CanvasWidth / Camera.z;
    var h = CanvasHeight / Camera.z;
    
    // Layout bounds range
    var bx = LayoutBounds.xMax - LayoutBounds.xMin || 1;
    var by = LayoutBounds.yMax - LayoutBounds.yMin || 1;
    
    // Convert normalized to screen coordinates
    var sx = (-Camera.x) + (x - LayoutBounds.xMin) / bx * w;
    var sy = (-Camera.y) + (y - LayoutBounds.yMin) / by * h;
    return { x: sx, y: sy };
}

/**
 * Maps tree depth to RGB color for gradient visualization
 * Creates a gradient: blue (root) -> purple -> red (deepest level)
 * 
 * @param {number} depth - Current depth level (0 = root)
 * @param {number} maxDepth - Maximum depth in the tree
 * @returns {Object} RGB color: { r: 0-255, g: 0-255, b: 0-255 }
 */
function depthToColor(depth, maxDepth) {
    if (maxDepth === 0) return { r: 100, g: 180, b: 255 };  // Default blue
    
    // Normalize depth to 0-1
    var t = depth / maxDepth;
    
    // Color interpolation:
    // Blue (depth 0):   rgb(100, 180, 255)
    // Purple (middle):  rgb(180, 100, 180) 
    // Red (max depth):  rgb(255, 80, 155)
    var r = Math.floor(100 + t * 155);  // 100 -> 255
    var g = Math.floor(180 - t * 100);  // 180 -> 80
    var b = Math.floor(255 - t * 100);  // 255 -> 155
    
    return { r: r, g: g, b: b };
}

/**
 * Render() - Draws the tree visualization
 * 
 * Called on each frame/camera update. Renders:
 * 1. Background
 * 2. Loading/error messages (if applicable)
 * 3. Edges (lines connecting parent to child)
 * 4. Nodes (colored dots)
 * 5. Truncation message (if tree was capped)
 */
function Render() {
    // Draw dark blue background
    BackContextHandle.fillStyle = "#1a1a2e";
    BackContextHandle.fillRect(-Camera.x, -Camera.y, CanvasWidth / Camera.z, CanvasHeight / Camera.z);

    // Show loading/parsing/error message if tree not ready
    if (TreeNodes.length === 0) {
        BackContextHandle.fillStyle = "#eee";
        BackContextHandle.font = "16px sans-serif";
        BackContextHandle.textAlign = "center";
        var msg = LoadStatus === "parsing" ? "Parsing directory_map.json…" : 
                  LoadStatus === "error" ? "Failed to load directory_map.json" : 
                  "Loading directory_map.json…";
        BackContextHandle.fillText(msg, CanvasWidth / Camera.z / 2 - Camera.x, CanvasHeight / Camera.z / 2 - Camera.y);
        return;
    }

    // Build node lookup map for edge rendering
    var nodeById = {};
    TreeNodes.forEach(function (n) { nodeById[n.id] = n; });
    
    // Find max depth for color calculation
    var maxDepth = 0;
    TreeNodes.forEach(function (n) { maxDepth = Math.max(maxDepth, n.depth); });

    // Set rendering styles
    BackContextHandle.lineCap = "round";
    BackContextHandle.lineJoin = "round";

    // Line and node sizes scale with camera zoom
    var lineW = Math.max(0.5, 1 / Camera.z);      // Edge line width
    var nodeR = Math.max(1, 3 / Camera.z);       // Node radius (dots)

    // Static view: do not update WorldRotation (no automatic rotation)

    // Recompute projected positions for current rotation (perspective)
    var f = 0.9; // focal length (normalized) - match MakePoster() value
    TreeNodes.forEach(function(n) {
        var theta = WorldRotation;
        var cx = 0.5;
        var dx = (n.wx || 0.5) - cx; // x relative to center
        var dz = n.z || 0;          // z (depth)
        // rotate around Y axis (standard right-handed rotation)
        var rx = cx + Math.cos(theta) * dx - Math.sin(theta) * dz;
        var rz = Math.sin(theta) * dx + Math.cos(theta) * dz;
        var scale = f / (f + rz);
        n.x = 0.5 + (rx - 0.5) * scale;
        n.y = 0.5 + ((n.wy || 0.5) - 0.5) * scale;
        n.projRadius = (n.radius || 0) * scale;
        n._rz = rz; // store rotated depth for sorting
    });

    // Edges removed for static/clean view

    // ========================================================================
    // Render nodes as shaded spheres (circles with radial gradient)
    // ========================================================================
    // Compute pixel scale for normalized units
    var w = CanvasWidth / Camera.z;
    var h = CanvasHeight / Camera.z;
    var bx = LayoutBounds.xMax - LayoutBounds.xMin || 1;
    var by = LayoutBounds.yMax - LayoutBounds.yMin || 1;
    var scale = (w / bx + h / by) * 0.5; // average pixel per normalized unit

    // depth-sort nodes: farthest (largest z) first
    var nodesSorted = TreeNodes.slice().sort(function(a,b){ return (b._rz||b.z||0) - (a._rz||a.z||0); });

    nodesSorted.forEach(function(n) {
        var p = toScreen(n.x, n.y);
        var radiusPx = Math.max(1, (n.projRadius || 0.005) * scale);

        // color based on depth
        var color = depthToColor(n.depth, maxDepth);

        // create radial gradient for sphere shading
        var gx = p.x - radiusPx * 0.25; // light source offset
        var gy = p.y - radiusPx * 0.25;
        var grad = BackContextHandle.createRadialGradient(gx, gy, Math.max(1, radiusPx*0.05), p.x, p.y, radiusPx);
        var inner = "rgba(" + Math.min(255, color.r + 40) + "," + Math.min(255, color.g + 40) + "," + Math.min(255, color.b + 40) + ",1)";
        var outer = "rgba(" + Math.floor(color.r*0.6) + "," + Math.floor(color.g*0.6) + "," + Math.floor(color.b*0.6) + ",1)";
        grad.addColorStop(0, inner);
        grad.addColorStop(0.6, "rgb(" + color.r + "," + color.g + "," + color.b + ")");
        grad.addColorStop(1, outer);

        BackContextHandle.beginPath();
        BackContextHandle.fillStyle = grad;
        BackContextHandle.arc(p.x, p.y, radiusPx, 0, Math.PI*2);
        BackContextHandle.fill();

        // subtle rim
        BackContextHandle.strokeStyle = "rgba(0,0,0,0.25)";
        BackContextHandle.lineWidth = Math.max(0.5, 1/Camera.z);
        BackContextHandle.beginPath();
        BackContextHandle.arc(p.x, p.y, radiusPx, 0, Math.PI*2);
        BackContextHandle.stroke();

        // labels removed for cleaner 3D view
    });
    
    // ========================================================================
    // Show truncation message if tree was capped
    // ========================================================================
    if (TruncatedMessage) {
        BackContextHandle.fillStyle = "rgba(255,255,255,0.8)";
        BackContextHandle.font = (12 / Camera.z) + "px sans-serif";
        BackContextHandle.textAlign = "left";
        BackContextHandle.fillText(TruncatedMessage, -Camera.x + 8, -Camera.y + CanvasHeight / Camera.z - 16);
    }
}

// ============================================================================
// INITIALIZATION: Load directory_map.json when page is ready
// ============================================================================
$(function () {
    // references main.js
    ratioX = 2;
    Init();

    $.ajax({
        url: "design3/directory_map.json",
        dataType: "text",
        timeout: 0,  // No timeout (handles large files)
        success: function (text) {
            // Show "Parsing..." message
            LoadStatus = "parsing";
            UpdateRender();
            
            // Parse JSON off main thread to avoid blocking UI
            setTimeout(function () {
                try {
                    DirectoryMap = JSON.parse(text);
                    MakePoster();  // Build tree structure
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
