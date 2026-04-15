/**
 * Setup Script for Game Development Environment
 * This script helps set up and manage dependencies for the game project.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Configuration
const config = {
    // Required directories
    directories: [
        'development',
        'development/js',
        'development/js/core',
        'development/js/config',
        'development/js/mechanics',
        'development/js/systems',
        'development/js/ui',
        'development/js/utils',
        'development/js/tests',
        'development/css'
    ],
    // Required NPM packages for development
    devDependencies: [
        'http-server',
        'eslint',
        'prettier'
    ]
};

// Check if package.json exists, if not create it
function createPackageJSON() {
    if (!fs.existsSync('package.json')) {
        console.log('Creating package.json...');
        
        const packageJson = {
            name: "2d-strategy-game",
            version: "0.0.4",
            description: "A 2D turn-based strategy game",
            main: "development/js/main.js",
            scripts: {
                "start": "http-server development -o -c-1",
                "test": "http-server development -o -c-1 tests.html",
                "lint": "eslint development/js/**/*.js",
                "format": "prettier --write development/js/**/*.js"
            },
            type: "module"
        };
        
        fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
        console.log('✅ package.json created successfully');
    } else {
        console.log('✅ package.json already exists');
    }
}

// Create required directories
function createDirectories() {
    console.log('Creating required directories...');
    
    config.directories.forEach(dir => {
        const dirPath = path.resolve(dir);
        
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`✅ Created directory: ${dir}`);
        } else {
            console.log(`✅ Directory already exists: ${dir}`);
        }
    });
}

// Install development dependencies
function installDependencies() {
    console.log('Installing development dependencies...');
    
    try {
        execSync(`npm install --save-dev ${config.devDependencies.join(' ')}`, { stdio: 'inherit' });
        console.log('✅ Dependencies installed successfully');
    } catch (error) {
        console.error('❌ Error installing dependencies:', error.message);
    }
}

// Create .gitignore file if it doesn't exist
function createGitIgnore() {
    if (!fs.existsSync('.gitignore')) {
        console.log('Creating .gitignore file...');
        
        const gitignore = `
# Dependencies
node_modules/
npm-debug.log
package-lock.json

# IDE files
.vscode/
.idea/
*.sublime-*
*.swp
*.swo

# OS generated files
.DS_Store
Thumbs.db
`;
        
        fs.writeFileSync('.gitignore', gitignore.trim());
        console.log('✅ .gitignore created successfully');
    } else {
        console.log('✅ .gitignore already exists');
    }
}

// Main setup function
function setup() {
    console.log('🎮 Setting up 2D Strategy Game development environment...\n');
    
    createPackageJSON();
    createDirectories();
    createGitIgnore();
    
    rl.question('\nDo you want to install npm dependencies? (y/n) ', (answer) => {
        if (answer.toLowerCase() === 'y') {
            installDependencies();
        }
        
        console.log('\n🎉 Setup complete! You can now run:');
        console.log('  npm start - to start the development server');
        console.log('  npm test - to run the test suite');
        
        rl.close();
    });
}

// Run setup
setup(); 
