const path = require('path');

try {
    const Parser = require('tree-sitter');
    console.log('✅ tree-sitter loaded');
    
    try {
        const JsParser = require('tree-sitter-javascript');
        console.log('✅ tree-sitter-javascript loaded');
    } catch (e) {
        console.log('⚠️ tree-sitter-javascript not available (optional)');
    }
    
    try {
        const TsParser = require('tree-sitter-typescript');
        console.log('✅ tree-sitter-typescript loaded');
    } catch (e) {
        console.log('⚠️ tree-sitter-typescript not available (optional)');
    }
    
    try {
        const PythonParser = require('tree-sitter-python');
        console.log('✅ tree-sitter-python loaded');
    } catch (e) {
        console.log('⚠️ tree-sitter-python not available (optional)');
    }
    
    // Test RepositoryMap
    const { RepositoryMap } = require('./api/server/services/Harness/RepositoryMap');
    const repoMap = new RepositoryMap({ workingDir: path.join(__dirname, 'api') });
    
    repoMap.buildMap().then(map => {
        console.log(`✅ RepositoryMap built: ${map.totalFiles} files, ${map.totalSymbols} symbols`);
        process.exit(0);
    }).catch(err => {
        console.error('❌ RepositoryMap build failed:', err.message);
        process.exit(1);
    });
    
} catch (err) {
    console.error('❌ tree-sitter test failed:', err.message);
    process.exit(1);
}
