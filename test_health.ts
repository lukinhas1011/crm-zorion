
async function testHealth() {
    try {
        const res = await fetch('http://localhost:3000/api/health');
        if (res.ok) {
            console.log('Health check passed');
        } else {
            console.log('Health check failed', res.status);
        }
    } catch (e) {
        console.error('Health check error:', e);
    }
}

testHealth();
