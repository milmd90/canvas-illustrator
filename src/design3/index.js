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
var MaxNodes = 15000;

/** Message to display if tree was truncated (null if not truncated) */
var TruncatedMessage = null;

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
    // STEP 3: Calculate layout parameters
    // ========================================================================
    var maxDepth = 0;
    nodeList.forEach(function (n) { maxDepth = Math.max(maxDepth, n.depth); });
    // Vertical spacing: divide canvas height evenly by depth levels
    var yStep = maxDepth > 0 ? 1 / maxDepth : 1;

    // ========================================================================
    // STEP 4: Calculate minimum horizontal spacing to prevent node overlap
    // ========================================================================
    var nodeCount = nodeList.length;
    
    // Spacing calculation notes:
    // - Node radius is ~3px (see Render function)
    // - We want at least 4x node radius (~12px) between nodes
    // - Normalized: 12px / 1200px canvas ≈ 0.01
    // - Scale up for larger trees using square root (better than linear)
    var baseSpacing = 0.015;  // Base spacing in normalized coordinates
    var scaledSpacing = baseSpacing * Math.max(1, Math.sqrt(nodeCount / 500));
    var minSpacing = Math.max(0.015, scaledSpacing);
    
    // ========================================================================
    // STEP 5: Layout algorithm - assign x, y positions to each node
    // ========================================================================
    var xCursor = 0;  // Tracks current x position as we lay out nodes
    
    /**
     * Recursive layout function: assigns x, y positions using hierarchical layout
     * Algorithm:
     * - Leaf nodes: assign sequential x positions with minSpacing
     * - Parent nodes: center over their children
     * - Enforces minimum spacing between siblings
     * 
     * @param {Object} node - Node to layout (must have .children array)
     */
    function layout(node) {
        // Set y position based on depth (top-down: depth 0 at top)
        node.y = node.depth * yStep;
        
        // Leaf node: assign x position and advance cursor
        if (node.children.length === 0) {
            node.x = xCursor;
            xCursor += minSpacing;
            return;
        }
        
        // Parent node: layout children first (depth-first)
        node.children.forEach(layout);
        
        // Enforce minimum spacing between sibling children
        // This prevents overlaps when children are close together
        for (var i = 0; i < node.children.length - 1; i++) {
            var current = node.children[i];
            var next = node.children[i + 1];
            var spacing = next.x - current.x;
            if (spacing < minSpacing) {
                var shift = minSpacing - spacing;
                // Shift all subsequent siblings to the right
                for (var j = i + 1; j < node.children.length; j++) {
                    node.children[j].x += shift;
                }
                // Update global cursor to prevent future overlaps
                xCursor = Math.max(xCursor, node.children[node.children.length - 1].x + minSpacing);
            }
        }
        
        // Center parent node over its children
        var childXMin = node.children[0].x;
        var childXMax = node.children[node.children.length - 1].x;
        node.x = (childXMin + childXMax) / 2;
    }
    
    // Layout all root-level nodes (depth 0)
    var roots = nodeList.filter(function (n) { return n.depth === 0; });
    roots.forEach(layout);
    
    // ========================================================================
    // STEP 6: Second pass - ensure spacing between root-level nodes
    // ========================================================================
    // Sort roots by x position
    roots.sort(function(a, b) { return a.x - b.x; });
    
    // Check spacing between adjacent root nodes and shift if needed
    for (var i = 0; i < roots.length - 1; i++) {
        var spacing = roots[i + 1].x - roots[i].x;
        if (spacing < minSpacing) {
            var shift = minSpacing - spacing;
            
            /**
             * Recursively shift a node and all its descendants
             * Used to maintain tree structure when shifting root nodes
             */
            function shiftSubtree(node, shiftAmount) {
                node.x += shiftAmount;
                if (node.children) {
                    node.children.forEach(function(child) {
                        shiftSubtree(child, shiftAmount);
                    });
                }
            }
            
            // Shift this root and all subsequent roots (and their subtrees)
            for (var j = i + 1; j < roots.length; j++) {
                shiftSubtree(roots[j], shift);
            }
        }
    }

    // ========================================================================
    // STEP 7: Normalize coordinates to 0-1 range and set layout bounds
    // ========================================================================
    // Find bounding box of all nodes
    var xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    nodeList.forEach(function (n) {
        xMin = Math.min(xMin, n.x);
        xMax = Math.max(xMax, n.x);
        yMin = Math.min(yMin, n.y);
        yMax = Math.max(yMax, n.y);
    });
    
    // Normalize x positions to 0-1 range (preserving relative spacing)
    var xRange = xMax - xMin || 1;
    var normalizedMinSpacing = minSpacing / xRange;
    nodeList.forEach(function (n) {
        n.x = (n.x - xMin) / xRange;  // Normalize x: 0 to 1
        n.y = n.y;  // y is already normalized (0 to 1)
    });
    
    // Set layout bounds with padding to accommodate full tree
    // Larger margin for large trees ensures everything fits on screen
    var margin = Math.max(0.1, normalizedMinSpacing * 3);
    LayoutBounds = { xMin: -margin, xMax: 1 + margin, yMin: -margin, yMax: 1 + margin };

    // Store results in global arrays
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

    // ========================================================================
    // Render edges (lines connecting parent to child)
    // ========================================================================
    BackContextHandle.lineWidth = lineW;
    TreeEdges.forEach(function (e) {
        var from = nodeById[e.from];
        var to = nodeById[e.to];
        if (!from || !to) return;
        
        // Convert normalized coordinates to screen pixels
        var p1 = toScreen(from.x, from.y);
        var p2 = toScreen(to.x, to.y);
        
        // Color edge based on child's depth
        var color = depthToColor(to.depth, maxDepth);
        BackContextHandle.strokeStyle = "rgba(" + color.r + "," + color.g + "," + color.b + ",0.4)";
        
        // Draw line
        BackContextHandle.beginPath();
        BackContextHandle.moveTo(p1.x, p1.y);
        BackContextHandle.lineTo(p2.x, p2.y);
        BackContextHandle.stroke();
    });

    // ========================================================================
    // Render nodes (colored dots)
    // ========================================================================
    TreeNodes.forEach(function (n) {
        // Convert normalized coordinates to screen pixels
        var p = toScreen(n.x, n.y);
        
        // Get color based on depth
        var color = depthToColor(n.depth, maxDepth);
        
        // Draw filled circle
        BackContextHandle.beginPath();
        BackContextHandle.arc(p.x, p.y, nodeR, 0, 2 * Math.PI);
        BackContextHandle.fillStyle = "rgb(" + color.r + "," + color.g + "," + color.b + ")";
        BackContextHandle.fill();
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
