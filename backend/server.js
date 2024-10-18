const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();
const PORT = 3000;
const path = require('path');
const holidays = ['12/25', '12/31'];
const advanceThreshold = -5;
const maxDaysInRequest = 10;
const expirationPeriod = 2;

// Load employee data from JSON file
let employees = JSON.parse(fs.readFileSync('./data/employees.json', 'utf8'));
let register = JSON.parse(fs.readFileSync('./data/register.json', 'utf8'));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend'))); // Serve static files from frontend directory

// Function to calculate vacation days requested
function calculateVacationDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let totalDays = 0;
    const holidays = ['2024-12-25', '2025-01-01']; // Adjust year accordingly or handle it dynamically

    for (let date = start; date <= end; date.setDate(date.getDate() + 1)) {
        const dayOfWeek = date.getDay();
        const dateString = date.toISOString().split('T')[0]; // Format date as YYYY-MM-DD

        // Check if it's a weekend (Saturday or Sunday) or a holiday
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.includes(dateString)) {
            totalDays++;
        }
    }

    return totalDays;
}

function registerDays(employeeId, effectiveDays) {
    const record = register.find( r => r.employeeId === employeeId && r.status === 'active' || r.status === 'future');

    if(!record) {
        const lastRecord = register.findLast( r => r.employeeId === employeeId );
        const nextPeriod = lastRecord.period + 1;
        const nextRecord = {
            employeeId,
            period: nextPeriod,
            days: 0,
            enjoyedDays: effectiveDays,
            status: 'future'
        }

        register.push(nextRecord);
    }
    else {
        if(record.status === 'active' && record.enjoyedDays + effectiveDays >= record.days) {
            const diffDays = effectiveDays - (record.days - record.enjoyedDays);
            record.enjoyedDays = record.days;
            record.status = 'closed';
            registerDays(employeeId, diffDays);
        }
        else {
            record.enjoyedDays += effectiveDays;
        }
    }
}

// Endpoint to request vacation
app.post('/request-vacation', (req, res) => {
    const { employeeId, startDate, endDate } = req.body;
    const employee = employees.find(emp => emp.id === employeeId);
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');


    if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
    }

    const vacationDays = calculateVacationDays(start, end);

    // Enforce maximum vacation days limit
    if (end < start) {
        return res.status(400).json({ message: 'End date must be greater than start date' });
    }

    if(start < new Date()) {
        return res.status(400).json({ message: 'Cannot request past days' });
    }

    if (vacationDays > maxDaysInRequest) {
        return res.status(400).json({ message: 'You can only request up to ' + maxDaysInRequest + ' vacation days at a time.' });
    }

    if ((employee.totalVacationDays - vacationDays) < advanceThreshold ) {
        return res.status(400).json({ message: 'Not enough vacation days available' });
    }

    // Validate that there are no other overlaping request
	const ranges = employee.vacationDaysRequested
		.filter(r => r.status !== 'Rejected')
		.map(r => new Array(new Date(r.startDate), new Date(r.endDate)));

	for (const [rStart, rEnd] of ranges) {
		// Check if the current range overlaps with the new range
		if (start <= rEnd && end >= rStart) {
		// Overlap detected
			return res.status(400).json({ message: 'Dates overlap' });
		}
    }

    // Store vacation request
    const requestId = employee.vacationDaysRequested.length + 1; // Generate ID for request
    const newRequest = {
        id: requestId,
        startDate: start,
        endDate: end,
        effectiveDays: vacationDays,
        status: 'Pending'
    };
    employee.vacationDaysRequested.push(newRequest);
    employee.totalVacationDays -= vacationDays; // Update the total vacation days
    employee.vacationDaysEnjoyed += vacationDays; // Update the total vacation days

    // Save updated employee data back to JSON file
    fs.writeFileSync('./data/employees.json', JSON.stringify(employees, null, 2));

    registerDays(employeeId, vacationDays);
    fs.writeFileSync('./data/register.json', JSON.stringify(register, null, 2));
    fs.writeFileSync('./data/register.json', JSON.stringify(register, null, 2));

    return res.status(200).json({ message: 'Vacation request submitted successfully' });
});

// Endpoint for boss to approve vacation request
app.post('/approve-vacation', (req, res) => {
    const { employeeId, requestId } = req.body;
    const employee = employees.find(emp => emp.id === employeeId);

    if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
    }

    const request = employee.vacationDaysRequested.find(req => req.id == requestId);

    if (!request) {
        return res.status(404).json({ message: 'Vacation request not found' });
    }

    // Approve the vacation request
    request.status = 'Approved';

    // Save updated employee data back to JSON file
    fs.writeFileSync('./data/employees.json', JSON.stringify(employees, null, 2));

    return res.status(200).json({ message: 'Vacation request approved successfully' });
});

// Endpoint for boss to reject vacation request
app.post('/reject-vacation', (req, res) => {
    const { employeeId, requestId } = req.body;
    const employee = employees.find(emp => emp.id === employeeId);

    if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
    }

    const request = employee.vacationDaysRequested.find(req => req.id == requestId);

    if (!request) {
        return res.status(404).json({ message: 'Vacation request not found' });
    }

    // Approve the vacation request
    request.status = 'Rejected';

    employee.vacationDaysEnjoyed -= request.effectiveDays;
    employee.totalVacationDays += request.effectiveDays;

    // Save updated employee data back to JSON file
    fs.writeFileSync('./data/employees.json', JSON.stringify(employees, null, 2));

    return res.status(200).json({ message: 'Vacation request rejected successfully' });
});

// Endpoint to get all vacation requests for an employee
app.get('/vacation-requests/:employeeId', (req, res) => {
    const employeeId = req.params.employeeId;
    const employee = employees.find(emp => emp.id === employeeId);

    if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
    }

    return res.json(employee.vacationDaysRequested);
});

// Endpoint to get employee data
app.get('/employees', (req, res) => {
    res.json(employees);
});

// Endpoint to get employee data
app.get('/register', (req, res) => {
    res.json(register);
});

// Endpoint to cancel a vacation request (basic implementation)
app.delete('/cancel-vacation', (req, res) => {
    const { employeeId, requestId } = req.body;
    const employee = employees.find(emp => emp.id === employeeId);

    if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
    }

    const requestIndex = employee.vacationDaysRequested.findIndex(req => req.id == requestId);

    if (requestIndex === -1) {
        return res.status(404).json({ message: 'Vacation request not found' });
    }

    if(employee.vacationDaysRequested[requestIndex].status === 'Approved') {
        return res.status(404).json({ message: 'Cannot cancel approved vacations' });
    }

    // Restore vacation days
    const canceledRequest = employee.vacationDaysRequested[requestIndex];
    const vacationDays = calculateVacationDays(canceledRequest.startDate, canceledRequest.endDate);
    employee.totalVacationDays += vacationDays; // Update total vacation days
    employee.vacationDaysEnjoyed -= employee.vacationDaysRequested[requestIndex].effectiveDays;

    // Remove the request from the array
    employee.vacationDaysRequested.splice(requestIndex, 1);

    // Save updated employee data back to JSON file
    fs.writeFileSync('./data/employees.json', JSON.stringify(employees, null, 2));

    return res.status(200).json({ message: 'Vacation request canceled successfully' });
});

function expireDays(period, employee) {
    const sumEnjoyed = (accumulator, current) => accumulator + current.effectiveDays;
    let periodRecord = register.find(p => p.period === period);

    if(!periodRecord || periodRecord.status === 'closed') {
        return;
    }

    periodRecord.status = 'closed';

    const enjoyedDays = employee.vacationDaysRequested
        .filter(r =>  new Date(r.startDate) > new Date(period + '-1-1'))
        .reduce(sumEnjoyed, 0) || 0;

    const expiredDays = periodRecord.days - enjoyedDays;
    if(expiredDays > 0) {
		employee.expiredVacationDays += expiredDays;
		employee.totalVacationDays -= expiredDays;
    }
}

app.post('/add-days', (req, res) => {
    const { employeeId, period, days } = req.body;
    const employee = employees.find(emp => emp.id === employeeId);
	let periodRecord = register.find(p => p.period === period && p.employeeId === employeeId);

    if(!periodRecord) {
        const enjoyedDays = 0;
        const status = 'active';
        periodRecord = {employeeId, period, days, enjoyedDays, status};

        register.push(periodRecord);
    }
    else if(periodRecord.status === 'active' || periodRecord.status === 'closed') {
        // These days have already been added
        return res.status(400).json({ message: 'Period already added' });
    }

    periodRecord.status = 'active';
    periodRecord.days = days;

    employee.vacationDaysAccumulated += days;
	employee.totalVacationDays += days;

    expireDays(period - expirationPeriod, employee);

    fs.writeFileSync('./data/employees.json', JSON.stringify(employees, null, 2));
    fs.writeFileSync('./data/register.json', JSON.stringify(register, null, 2));

    return res.status(200).end();
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

