document.getElementById('vacation-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const employeeId = document.getElementById('employee-id').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    const response = await fetch('http://localhost:3000/request-vacation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ employeeId, startDate, endDate })
    });

    const result = await response.json();
    document.getElementById('response').innerText = result.message;
});

