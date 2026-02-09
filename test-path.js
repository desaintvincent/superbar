// Simulating the path structure
// If you have: Bookmarks > /home > clim > bookmark
// The path array would be: ["Bookmarks", "/home", "clim", "bookmark"]
// If you have: Bookmarks > /null > bookmark  
// The path array would be: ["Bookmarks", "/null", "bookmark"]
// If the folder is literally named "/home/clim" (single folder with slash in name)
// The path array would be: ["Bookmarks", "/home/clim", "bookmark"]
console.log("Test 1: Folder named '/home' with subfolder 'clim'");
console.log("Path: ['Bookmarks', '/home', 'clim', 'bookmark']");
console.log("To ignore: use ['/home', 'clim'] or just ['/home']");
console.log("\nTest 2: Single folder named '/home/clim'");
console.log("Path: ['Bookmarks', '/home/clim', 'bookmark']");
console.log("To ignore: use ['/home/clim']");
console.log("\nTest 3: Folder named '/null'");
console.log("Path: ['Bookmarks', '/null', 'bookmark']");
console.log("To ignore: use ['/null']");
