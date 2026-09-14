const fs = require('fs');
// Let's write a small standalone function to test this logic on synthetic arrays
function refineBounds(rowDark, minY, maxY, expectedH) {
    let maxBottomDelta = -1;
    let bestBottomY = maxY;
    
    // Search for bottom edge (transition from solid to less solid)
    for (let py = maxY - 2; py >= minY + 2; py--) {
        let above = rowDark[py - 1] + rowDark[py - 2];
        let below = rowDark[py + 1] + rowDark[py + 2];
        let delta = above - below;
        
        // We also want the row itself to be somewhat dense
        if (delta > maxBottomDelta) {
            maxBottomDelta = delta;
            bestBottomY = py;
        }
    }
    
    let maxTopDelta = -1;
    let bestTopY = minY;
    
    for (let py = minY + 2; py <= maxY - 2; py++) {
        let above = rowDark[py - 1] + rowDark[py - 2];
        let below = rowDark[py + 1] + rowDark[py + 2];
        let delta = below - above;
        
        if (delta > maxTopDelta) {
            maxTopDelta = delta;
            bestTopY = py;
        }
    }
    
    return { bestTopY, bestBottomY, maxTopDelta, maxBottomDelta };
}

let mockRowDark = [0, 0, 0, 5, 10, 15, 20, 20, 20, 20, 20, 20, 20, 20, 8, 5, 2, 0];
// Kippah (0-5), Tefillin (6-13), Hair (14-17)
console.log(refineBounds(mockRowDark, 0, 17, 8));
