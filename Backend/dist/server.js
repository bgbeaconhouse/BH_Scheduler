"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const PORT = process.env.PORT || 3001;
app.set('trust proxy', 1);
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Basic health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
});
// JWT verification middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};
function parseAsLocalDate(dateString) {
    const cleanDateString = dateString.replace('Z', '').replace(/\+.*$/, '');
    return new Date(cleanDateString);
}
// Auth routes
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        const adminExists = await prisma.systemSetting.findUnique({
            where: { key: 'admin_setup_complete' }
        });
        if (!adminExists) {
            return res.status(400).json({
                error: 'System not initialized',
                requiresSetup: true
            });
        }
        const [adminUsername, adminPasswordHash] = await Promise.all([
            prisma.systemSetting.findUnique({ where: { key: 'admin_username' } }),
            prisma.systemSetting.findUnique({ where: { key: 'admin_password_hash' } })
        ]);
        if (!adminUsername || !adminPasswordHash) {
            return res.status(500).json({ error: 'Admin credentials not found' });
        }
        if (username !== adminUsername.value) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const passwordValid = await bcryptjs_1.default.compare(password, adminPasswordHash.value);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ username: adminUsername.value, role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });
        res.json({
            token,
            user: {
                username: adminUsername.value,
                role: 'admin'
            }
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});
app.post('/api/auth/setup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        const adminExists = await prisma.systemSetting.findUnique({
            where: { key: 'admin_setup_complete' }
        });
        if (adminExists) {
            return res.status(400).json({ error: 'System already initialized' });
        }
        const saltRounds = 12;
        const passwordHash = await bcryptjs_1.default.hash(password, saltRounds);
        await prisma.systemSetting.createMany({
            data: [
                { key: 'admin_username', value: username },
                { key: 'admin_password_hash', value: passwordHash },
                { key: 'admin_setup_complete', value: 'true' }
            ]
        });
        const token = jsonwebtoken_1.default.sign({ username, role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });
        res.status(201).json({
            token,
            user: {
                username,
                role: 'admin'
            },
            message: 'Admin account created successfully'
        });
    }
    catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({ error: 'Setup failed' });
    }
});
app.get('/api/auth/setup-status', async (req, res) => {
    try {
        const adminExists = await prisma.systemSetting.findUnique({
            where: { key: 'admin_setup_complete' }
        });
        res.json({
            requiresSetup: !adminExists
        });
    }
    catch (error) {
        console.error('Setup status error:', error);
        res.status(500).json({ error: 'Failed to check setup status' });
    }
});
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({
        valid: true,
        user: req.user
    });
});
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }
        const adminPasswordHash = await prisma.systemSetting.findUnique({
            where: { key: 'admin_password_hash' }
        });
        if (!adminPasswordHash) {
            return res.status(500).json({ error: 'Admin credentials not found' });
        }
        const passwordValid = await bcryptjs_1.default.compare(currentPassword, adminPasswordHash.value);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        const saltRounds = 12;
        const newPasswordHash = await bcryptjs_1.default.hash(newPassword, saltRounds);
        await prisma.systemSetting.update({
            where: { key: 'admin_password_hash' },
            data: { value: newPasswordHash }
        });
        res.json({ message: 'Password changed successfully' });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});
// Protect all other routes
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) {
        return next();
    }
    authenticateToken(req, res, next);
});
// Residents routes
app.get('/api/residents', async (req, res) => {
    try {
        const residents = await prisma.resident.findMany({
            where: { isActive: true },
            include: {
                qualifications: {
                    include: { qualification: true }
                }
            },
            orderBy: [
                { lastName: 'asc' },
                { firstName: 'asc' }
            ]
        });
        res.json(residents);
    }
    catch (error) {
        console.error('Error fetching residents:', error);
        res.status(500).json({ error: 'Failed to fetch residents' });
    }
});
app.post('/api/residents', async (req, res) => {
    try {
        const { firstName, lastName, admissionDate, notes } = req.body;
        if (!firstName || !lastName || !admissionDate) {
            return res.status(400).json({ error: 'First name, last name, and admission date are required' });
        }
        const resident = await prisma.resident.create({
            data: {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                admissionDate: new Date(admissionDate),
                notes: notes?.trim() || null
            }
        });
        res.status(201).json(resident);
    }
    catch (error) {
        console.error('Error creating resident:', error);
        res.status(500).json({ error: 'Failed to create resident' });
    }
});
app.put('/api/residents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, admissionDate, notes } = req.body;
        if (!firstName || !lastName || !admissionDate) {
            return res.status(400).json({ error: 'First name, last name, and admission date are required' });
        }
        const resident = await prisma.resident.update({
            where: { id: parseInt(id) },
            data: {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                admissionDate: new Date(admissionDate),
                notes: notes?.trim() || null
            }
        });
        res.json(resident);
    }
    catch (error) {
        console.error('Error updating resident:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Resident not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to update resident' });
        }
    }
});
app.delete('/api/residents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const resident = await prisma.resident.update({
            where: { id: parseInt(id) },
            data: { isActive: false }
        });
        res.json({ message: 'Resident removed successfully', resident });
    }
    catch (error) {
        console.error('Error removing resident:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Resident not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to remove resident' });
        }
    }
});
app.get('/api/residents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const resident = await prisma.resident.findUnique({
            where: { id: parseInt(id) },
            include: {
                qualifications: {
                    include: { qualification: true }
                },
                availability: true,
                appointments: {
                    include: { appointmentType: true }
                }
            }
        });
        if (!resident) {
            return res.status(404).json({ error: 'Resident not found' });
        }
        res.json(resident);
    }
    catch (error) {
        console.error('Error fetching resident:', error);
        res.status(500).json({ error: 'Failed to fetch resident' });
    }
});
// Qualifications routes
app.get('/api/qualifications', async (req, res) => {
    try {
        const qualifications = await prisma.qualification.findMany({
            include: {
                residents: {
                    include: {
                        resident: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true
                            }
                        }
                    }
                }
            },
            orderBy: [
                { category: 'asc' },
                { name: 'asc' }
            ]
        });
        res.json(qualifications);
    }
    catch (error) {
        console.error('Error fetching qualifications:', error);
        res.status(500).json({ error: 'Failed to fetch qualifications' });
    }
});
app.post('/api/qualifications', async (req, res) => {
    try {
        const { name, description, category } = req.body;
        if (!name || !category) {
            return res.status(400).json({ error: 'Name and category are required' });
        }
        const qualification = await prisma.qualification.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                category: category.trim()
            }
        });
        res.status(201).json(qualification);
    }
    catch (error) {
        console.error('Error creating qualification:', error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'Qualification name already exists' });
        }
        else {
            res.status(500).json({ error: 'Failed to create qualification' });
        }
    }
});
app.put('/api/qualifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category } = req.body;
        if (!name || !category) {
            return res.status(400).json({ error: 'Name and category are required' });
        }
        const qualification = await prisma.qualification.update({
            where: { id: parseInt(id) },
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                category: category.trim()
            }
        });
        res.json(qualification);
    }
    catch (error) {
        console.error('Error updating qualification:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Qualification not found' });
        }
        else if (error.code === 'P2002') {
            res.status(400).json({ error: 'Qualification name already exists' });
        }
        else {
            res.status(500).json({ error: 'Failed to update qualification' });
        }
    }
});
app.delete('/api/qualifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const inUse = await prisma.residentQualification.findFirst({
            where: { qualificationId: parseInt(id) }
        });
        if (inUse) {
            return res.status(400).json({
                error: 'Cannot delete qualification - it is assigned to residents'
            });
        }
        await prisma.qualification.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Qualification deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting qualification:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Qualification not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to delete qualification' });
        }
    }
});
// Resident qualifications routes
app.get('/api/residents/:id/qualifications', async (req, res) => {
    try {
        const { id } = req.params;
        const qualifications = await prisma.residentQualification.findMany({
            where: {
                residentId: parseInt(id),
                isActive: true
            },
            include: {
                qualification: true
            },
            orderBy: {
                dateEarned: 'desc'
            }
        });
        res.json(qualifications);
    }
    catch (error) {
        console.error('Error fetching resident qualifications:', error);
        res.status(500).json({ error: 'Failed to fetch resident qualifications' });
    }
});
app.post('/api/residents/:id/qualifications', async (req, res) => {
    try {
        const { id } = req.params;
        const { qualificationId, notes } = req.body;
        if (!qualificationId) {
            return res.status(400).json({ error: 'Qualification ID is required' });
        }
        const existing = await prisma.residentQualification.findFirst({
            where: {
                residentId: parseInt(id),
                qualificationId: parseInt(qualificationId),
                isActive: true
            }
        });
        if (existing) {
            return res.status(400).json({ error: 'Resident already has this qualification' });
        }
        const residentQualification = await prisma.residentQualification.create({
            data: {
                residentId: parseInt(id),
                qualificationId: parseInt(qualificationId),
                notes: notes?.trim() || null
            },
            include: {
                qualification: true,
                resident: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });
        res.status(201).json(residentQualification);
    }
    catch (error) {
        console.error('Error assigning qualification:', error);
        res.status(500).json({ error: 'Failed to assign qualification' });
    }
});
app.delete('/api/residents/:residentId/qualifications/:qualificationId', async (req, res) => {
    try {
        const { residentId, qualificationId } = req.params;
        const updated = await prisma.residentQualification.updateMany({
            where: {
                residentId: parseInt(residentId),
                qualificationId: parseInt(qualificationId),
                isActive: true
            },
            data: {
                isActive: false
            }
        });
        if (updated.count === 0) {
            return res.status(404).json({ error: 'Qualification assignment not found' });
        }
        res.json({ message: 'Qualification removed successfully' });
    }
    catch (error) {
        console.error('Error removing qualification:', error);
        res.status(500).json({ error: 'Failed to remove qualification' });
    }
});
app.get('/api/residents-with-qualifications', async (req, res) => {
    try {
        const residents = await prisma.resident.findMany({
            where: { isActive: true },
            include: {
                qualifications: {
                    where: { isActive: true },
                    include: {
                        qualification: true
                    }
                }
            },
            orderBy: [
                { lastName: 'asc' },
                { firstName: 'asc' }
            ]
        });
        res.json(residents);
    }
    catch (error) {
        console.error('Error fetching residents with qualifications:', error);
        res.status(500).json({ error: 'Failed to fetch residents with qualifications' });
    }
});
// Departments routes
app.get('/api/departments', async (req, res) => {
    try {
        const departments = await prisma.department.findMany({
            include: {
                shifts: {
                    include: {
                        roles: {
                            include: {
                                qualification: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                priority: 'desc'
            }
        });
        res.json(departments);
    }
    catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});
app.post('/api/departments', async (req, res) => {
    try {
        const { name, description, priority } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Department name is required' });
        }
        const department = await prisma.department.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                priority: priority || 0
            }
        });
        res.status(201).json(department);
    }
    catch (error) {
        console.error('Error creating department:', error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'Department name already exists' });
        }
        else {
            res.status(500).json({ error: 'Failed to create department' });
        }
    }
});
app.put('/api/departments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, priority } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Department name is required' });
        }
        const department = await prisma.department.update({
            where: { id: parseInt(id) },
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                priority: priority || 0
            }
        });
        res.json(department);
    }
    catch (error) {
        console.error('Error updating department:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Department not found' });
        }
        else if (error.code === 'P2002') {
            res.status(400).json({ error: 'Department name already exists' });
        }
        else {
            res.status(500).json({ error: 'Failed to update department' });
        }
    }
});
app.delete('/api/departments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const shiftsCount = await prisma.shift.count({
            where: { departmentId: parseInt(id) }
        });
        if (shiftsCount > 0) {
            return res.status(400).json({
                error: 'Cannot delete department - it has shifts assigned'
            });
        }
        await prisma.department.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Department deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting department:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Department not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to delete department' });
        }
    }
});
// Shifts routes
app.get('/api/shifts', async (req, res) => {
    try {
        const shifts = await prisma.shift.findMany({
            where: { isActive: true },
            include: {
                department: true,
                roles: {
                    include: {
                        qualification: true
                    }
                }
            },
            orderBy: [
                { department: { priority: 'desc' } },
                { name: 'asc' }
            ]
        });
        res.json(shifts);
    }
    catch (error) {
        console.error('Error fetching shifts:', error);
        res.status(500).json({ error: 'Failed to fetch shifts' });
    }
});
app.post('/api/shifts', async (req, res) => {
    try {
        const { departmentId, name, description, startTime, endTime, monday, tuesday, wednesday, thursday, friday, saturday, sunday, minTenureMonths, blocksAllAppointments, blocksCounselingOnly, allowsTemporaryLeave, roles } = req.body;
        if (!departmentId || !name || !startTime || !endTime) {
            return res.status(400).json({ error: 'Department, name, start time, and end time are required' });
        }
        const shift = await prisma.shift.create({
            data: {
                departmentId: parseInt(departmentId),
                name: name.trim(),
                description: description?.trim() || null,
                startTime,
                endTime,
                monday: monday || false,
                tuesday: tuesday || false,
                wednesday: wednesday || false,
                thursday: thursday || false,
                friday: friday || false,
                saturday: saturday || false,
                sunday: sunday || false,
                minTenureMonths: minTenureMonths || 0,
                blocksAllAppointments: blocksAllAppointments || false,
                blocksCounselingOnly: blocksCounselingOnly || false,
                allowsTemporaryLeave: allowsTemporaryLeave || false,
                roles: {
                    create: roles?.map((role) => ({
                        qualificationId: role.qualificationId || null,
                        roleTitle: role.roleTitle,
                        requiredCount: role.requiredCount || 1
                    })) || []
                }
            },
            include: {
                department: true,
                roles: {
                    include: {
                        qualification: true
                    }
                }
            }
        });
        res.status(201).json(shift);
    }
    catch (error) {
        console.error('Error creating shift:', error);
        res.status(500).json({ error: 'Failed to create shift' });
    }
});
app.put('/api/shifts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { departmentId, name, description, startTime, endTime, monday, tuesday, wednesday, thursday, friday, saturday, sunday, minTenureMonths, blocksAllAppointments, blocksCounselingOnly, allowsTemporaryLeave, roles } = req.body;
        if (!departmentId || !name || !startTime || !endTime) {
            return res.status(400).json({ error: 'Department, name, start time, and end time are required' });
        }
        await prisma.shiftRole.deleteMany({
            where: { shiftId: parseInt(id) }
        });
        const shift = await prisma.shift.update({
            where: { id: parseInt(id) },
            data: {
                departmentId: parseInt(departmentId),
                name: name.trim(),
                description: description?.trim() || null,
                startTime,
                endTime,
                monday: monday || false,
                tuesday: tuesday || false,
                wednesday: wednesday || false,
                thursday: thursday || false,
                friday: friday || false,
                saturday: saturday || false,
                sunday: sunday || false,
                minTenureMonths: minTenureMonths || 0,
                blocksAllAppointments: blocksAllAppointments || false,
                blocksCounselingOnly: blocksCounselingOnly || false,
                allowsTemporaryLeave: allowsTemporaryLeave || false,
                roles: {
                    create: roles?.map((role) => ({
                        qualificationId: role.qualificationId || null,
                        roleTitle: role.roleTitle,
                        requiredCount: role.requiredCount || 1
                    })) || []
                }
            },
            include: {
                department: true,
                roles: {
                    include: {
                        qualification: true
                    }
                }
            }
        });
        res.json(shift);
    }
    catch (error) {
        console.error('Error updating shift:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Shift not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to update shift' });
        }
    }
});
app.delete('/api/shifts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const shift = await prisma.shift.update({
            where: { id: parseInt(id) },
            data: { isActive: false }
        });
        res.json({ message: 'Shift deleted successfully', shift });
    }
    catch (error) {
        console.error('Error deleting shift:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Shift not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to delete shift' });
        }
    }
});
app.get('/api/shifts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const shift = await prisma.shift.findUnique({
            where: { id: parseInt(id) },
            include: {
                department: true,
                roles: {
                    include: {
                        qualification: true
                    }
                }
            }
        });
        if (!shift) {
            return res.status(404).json({ error: 'Shift not found' });
        }
        res.json(shift);
    }
    catch (error) {
        console.error('Error fetching shift:', error);
        res.status(500).json({ error: 'Failed to fetch shift' });
    }
});
// Schedule routes
app.get('/api/schedule-periods', async (req, res) => {
    try {
        const periods = await prisma.schedulePeriod.findMany({
            include: {
                assignments: {
                    include: {
                        shift: {
                            include: {
                                department: true,
                                roles: {
                                    include: {
                                        qualification: true
                                    }
                                }
                            }
                        },
                        resident: true
                    }
                }
            },
            orderBy: {
                startDate: 'desc'
            }
        });
        res.json(periods);
    }
    catch (error) {
        console.error('Error fetching schedule periods:', error);
        res.status(500).json({ error: 'Failed to fetch schedule periods' });
    }
});
app.post('/api/schedule-periods', async (req, res) => {
    try {
        const { name, startDate, endDate } = req.body;
        if (!name || !startDate || !endDate) {
            return res.status(400).json({ error: 'Name, start date, and end date are required' });
        }
        const period = await prisma.schedulePeriod.create({
            data: {
                name: name.trim(),
                startDate: new Date(startDate),
                endDate: new Date(endDate)
            }
        });
        res.status(201).json(period);
    }
    catch (error) {
        console.error('Error creating schedule period:', error);
        res.status(500).json({ error: 'Failed to create schedule period' });
    }
});
// SIMPLE FIX: Just track and reuse shelter run teams for the same day
// Enhanced schedule generation logic with proper 3-day work limit
// Replace the generate-schedule endpoint in your backend (around line 900)
app.post('/api/generate-schedule', async (req, res) => {
    try {
        const { schedulePeriodId, startDate, endDate } = req.body;
        if (!schedulePeriodId || !startDate || !endDate) {
            return res.status(400).json({ error: 'Schedule period ID, start date, and end date are required' });
        }
        console.log('🔥 SCHEDULE GENERATION STARTED - WITH 3-DAY WORK LIMIT');
        console.log('Period:', schedulePeriodId, 'Dates:', startDate, 'to', endDate);
        // Clear existing assignments for this period
        await prisma.shiftAssignment.deleteMany({
            where: { schedulePeriodId: parseInt(schedulePeriodId) }
        });
        // Clear existing conflicts for this date range
        await prisma.scheduleConflict.deleteMany({
            where: {
                conflictDate: {
                    gte: new Date(startDate),
                    lte: new Date(endDate)
                }
            }
        });
        // Get all active shifts with their requirements
        const shifts = await prisma.shift.findMany({
            where: { isActive: true },
            include: {
                department: true,
                roles: {
                    include: {
                        qualification: true
                    }
                }
            },
            orderBy: [
                { department: { priority: 'desc' } },
                { startTime: 'asc' }
            ]
        });
        // Get all active residents with their qualifications
        const residents = await prisma.resident.findMany({
            where: { isActive: true },
            include: {
                qualifications: {
                    where: { isActive: true },
                    include: {
                        qualification: true
                    }
                },
                appointments: {
                    where: {
                        startDateTime: {
                            gte: new Date(startDate),
                            lte: new Date(endDate)
                        },
                        isActive: true
                    },
                    include: {
                        appointmentType: true
                    }
                },
                availability: {
                    where: { isActive: true }
                }
            }
        });
        console.log(`📊 Found ${shifts.length} shifts and ${residents.length} residents`);
        // Generate date range
        const start = new Date(startDate);
        const end = new Date(endDate);
        const dates = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
        }
        const assignments = [];
        const conflicts = [];
        // Track weekly work counts for each resident (KEY ENHANCEMENT)
        const weeklyWorkCounts = new Map();
        residents.forEach(resident => {
            weeklyWorkCounts.set(resident.id, 0);
        });
        console.log(`📅 Processing ${dates.length} dates with 3-day work limit`);
        // Process each date
        for (const date of dates) {
            const dayOfWeek = date.getDay();
            const dayUsed = new Set();
            const dateStr = date.toISOString().split('T')[0];
            // Track consistent teams for this day
            const shelterRunTeams = {};
            const kitchenTeams = {};
            console.log(`\n📆 Processing ${dateStr} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek]})`);
            // Get shifts that run on this day
            const dayShifts = shifts.filter(shift => {
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                return shift[days[dayOfWeek]] === true;
            });
            console.log(`  🔄 Found ${dayShifts.length} shifts for this day`);
            // Process shifts by department priority
            for (const shift of dayShifts) {
                console.log(`    🏢 Processing ${shift.department.name} - ${shift.name}`);
                for (const role of shift.roles) {
                    console.log(`      🎯 Processing role: ${role.roleTitle} (need ${role.requiredCount})`);
                    for (let i = 0; i < role.requiredCount; i++) {
                        console.log(`        👤 Looking for resident for ${role.roleTitle} (slot ${i + 1}/${role.requiredCount})`);
                        let selectedResident = null;
                        // Check for existing team assignments (shelter runs, kitchen teams)
                        if (shift.department.name === 'shelter_runs') {
                            const teamKey = `${role.roleTitle}_${i}`;
                            if (shelterRunTeams[teamKey]) {
                                const existingResidentId = shelterRunTeams[teamKey];
                                selectedResident = residents.find(r => r.id === existingResidentId);
                                if (selectedResident) {
                                    console.log(`        🔄 Reusing shelter run team member: ${selectedResident.firstName} ${selectedResident.lastName}`);
                                }
                            }
                        }
                        else if (shift.department.name === 'kitchen') {
                            if (role.roleTitle === 'janitor') {
                                const availablePrepMembers = Object.values(kitchenTeams);
                                if (availablePrepMembers.length > i && availablePrepMembers[i]) {
                                    const existingResidentId = availablePrepMembers[i];
                                    selectedResident = residents.find(r => r.id === existingResidentId);
                                    if (selectedResident) {
                                        console.log(`        🔄 Reusing prep team member as janitor: ${selectedResident.firstName} ${selectedResident.lastName}`);
                                    }
                                }
                            }
                        }
                        // If no existing team member, find someone new
                        if (!selectedResident) {
                            // Find eligible residents for this role
                            const eligibleResidents = residents.filter(resident => {
                                // Check if already assigned this day
                                if (dayUsed.has(resident.id))
                                    return false;
                                // Check for San Pedro only restriction
                                const hasPedroOnlyQualification = resident.qualifications.some(rq => rq.qualification.name === 'thrift_pedro_only');
                                if (hasPedroOnlyQualification) {
                                    if (shift.department.name !== 'thrift_stores' || shift.name !== 'San Pedro Thrift Store') {
                                        console.log(`🚫 PEDRO ONLY: ${resident.firstName} ${resident.lastName} excluded from ${shift.department.name}-${shift.name} (Pedro-only worker)`);
                                        return false;
                                    }
                                }
                                // Check tenure requirement
                                if (shift.minTenureMonths > 0) {
                                    const admissionDate = new Date(resident.admissionDate);
                                    const monthsDiff = (date.getTime() - admissionDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
                                    if (monthsDiff < shift.minTenureMonths)
                                        return false;
                                }
                                // Check qualification requirement
                                if (role.qualificationId) {
                                    const hasQualification = resident.qualifications.some(rq => rq.qualificationId === role.qualificationId);
                                    if (!hasQualification)
                                        return false;
                                }
                                // Check availability
                                const dayAvailability = resident.availability.find(a => a.dayOfWeek === dayOfWeek);
                                if (dayAvailability) {
                                    const shiftStart = new Date(`2000-01-01T${shift.startTime}:00`);
                                    const shiftEnd = new Date(`2000-01-01T${shift.endTime}:00`);
                                    const availStart = new Date(`2000-01-01T${dayAvailability.startTime}:00`);
                                    const availEnd = new Date(`2000-01-01T${dayAvailability.endTime}:00`);
                                    if (shiftStart < availStart || shiftEnd > availEnd)
                                        return false;
                                }
                                // 🚨 ENHANCED: Check 3-day weekly work limit
                                const currentWeeklyCount = weeklyWorkCounts.get(resident.id) || 0;
                                if (currentWeeklyCount >= 3) {
                                    console.log(`🚫 3-DAY LIMIT: ${resident.firstName} ${resident.lastName} already worked ${currentWeeklyCount} days this week`);
                                    return false;
                                }
                                // Check appointment conflicts
                                const conflictingAppointments = resident.appointments.filter(apt => {
                                    const aptStart = new Date(apt.startDateTime);
                                    const aptEnd = new Date(apt.endDateTime);
                                    const aptDateStr = aptStart.toLocaleDateString('en-CA');
                                    const currentDateStr = date.toLocaleDateString('en-CA');
                                    if (aptDateStr !== currentDateStr)
                                        return false;
                                    if (shift.blocksCounselingOnly && apt.appointmentType.name === 'counseling')
                                        return true;
                                    if (shift.blocksAllAppointments)
                                        return true;
                                    const shiftDate = new Date(date);
                                    const [shiftStartHour, shiftStartMin] = shift.startTime.split(':').map(Number);
                                    const [shiftEndHour, shiftEndMin] = shift.endTime.split(':').map(Number);
                                    const shiftStartTime = new Date(shiftDate);
                                    shiftStartTime.setHours(shiftStartHour, shiftStartMin, 0, 0);
                                    const shiftEndTime = new Date(shiftDate);
                                    shiftEndTime.setHours(shiftEndHour, shiftEndMin, 0, 0);
                                    const hasTimeOverlap = (aptStart < shiftEndTime && aptEnd > shiftStartTime);
                                    if (hasTimeOverlap) {
                                        console.log(`🚫 CONFLICT: ${resident.firstName} ${resident.lastName} excluded from ${shift.department.name}-${shift.name} due to ${apt.title} appointment`);
                                    }
                                    return hasTimeOverlap;
                                });
                                // Exclude residents with appointments on the same day
                                if (resident.appointments.some(apt => {
                                    const aptDateStr = new Date(apt.startDateTime).toLocaleDateString('en-CA');
                                    const currentDateStr = date.toLocaleDateString('en-CA');
                                    return aptDateStr === currentDateStr;
                                })) {
                                    console.log(`🚫 APPOINTMENT: Excluding ${resident.firstName} ${resident.lastName} - has appointment on ${date.toLocaleDateString('en-CA')}`);
                                    return false;
                                }
                                return conflictingAppointments.length === 0;
                            });
                            console.log(`          👥 Found ${eligibleResidents.length} eligible residents`);
                            if (eligibleResidents.length > 0) {
                                // Load balancing - prefer residents with fewer work days
                                const sortedCandidates = eligibleResidents.sort((a, b) => {
                                    // First priority: weekly work count (fewer is better)
                                    const aWeeklyCount = weeklyWorkCounts.get(a.id) || 0;
                                    const bWeeklyCount = weeklyWorkCounts.get(b.id) || 0;
                                    if (aWeeklyCount !== bWeeklyCount) {
                                        return aWeeklyCount - bWeeklyCount;
                                    }
                                    // Second priority: current assignments in this generation
                                    const aAssignments = assignments.filter(assign => assign.residentId === a.id).length;
                                    const bAssignments = assignments.filter(assign => assign.residentId === b.id).length;
                                    return aAssignments - bAssignments;
                                });
                                selectedResident = sortedCandidates[0];
                                // Remember team members for consistency
                                if (shift.department.name === 'shelter_runs') {
                                    const teamKey = `${role.roleTitle}_${i}`;
                                    shelterRunTeams[teamKey] = selectedResident.id;
                                    console.log(`        📝 Registered shelter run team: ${teamKey} = ${selectedResident.firstName}`);
                                }
                                else if (shift.department.name === 'kitchen' && (role.roleTitle === 'prep_worker' || role.roleTitle === 'prep_lead')) {
                                    const teamKey = `${role.roleTitle}_${i}`;
                                    kitchenTeams[teamKey] = selectedResident.id;
                                    console.log(`        📝 Registered prep team member for janitor duty: ${teamKey} = ${selectedResident.firstName}`);
                                }
                            }
                        }
                        // Create assignment if we found someone
                        if (selectedResident) {
                            const assignment = {
                                schedulePeriodId: parseInt(schedulePeriodId),
                                shiftId: shift.id,
                                residentId: selectedResident.id,
                                assignedDate: date,
                                roleTitle: role.roleTitle,
                                status: 'scheduled'
                            };
                            assignments.push(assignment);
                            // 🚨 ENHANCED: Update weekly work count
                            const currentCount = weeklyWorkCounts.get(selectedResident.id) || 0;
                            weeklyWorkCounts.set(selectedResident.id, currentCount + 1);
                            console.log(`📊 WORK COUNT: ${selectedResident.firstName} ${selectedResident.lastName} now has ${currentCount + 1} work days this week`);
                            // Only mark as dayUsed if this is their first assignment of the day
                            const isReusedTeamMember = ((shift.department.name === 'shelter_runs' && Object.values(shelterRunTeams).includes(selectedResident.id)) ||
                                (shift.department.name === 'kitchen' && role.roleTitle === 'janitor' && Object.values(kitchenTeams).includes(selectedResident.id)));
                            if (!isReusedTeamMember) {
                                dayUsed.add(selectedResident.id);
                            }
                            console.log(`          ✅ Assigned ${selectedResident.firstName} ${selectedResident.lastName}`);
                        }
                        else {
                            // Record conflict - no eligible residents
                            const conflict = {
                                residentId: 0,
                                conflictDate: date,
                                conflictType: 'no_eligible_residents',
                                description: `No eligible residents for ${shift.department.name} - ${shift.name} - ${role.roleTitle} (slot ${i + 1}/${role.requiredCount}). May be due to 3-day work limit, qualifications, or appointments.`,
                                severity: 'error'
                            };
                            conflicts.push(conflict);
                            console.log(`          ❌ No eligible residents - conflict recorded`);
                        }
                    }
                }
            }
        }
        // Log final work distribution
        console.log(`\n📊 FINAL WORK DISTRIBUTION:`);
        weeklyWorkCounts.forEach((count, residentId) => {
            if (count > 0) {
                const resident = residents.find(r => r.id === residentId);
                console.log(`📊 - ${resident?.firstName} ${resident?.lastName}: ${count} work days`);
            }
        });
        console.log(`\n📊 GENERATION COMPLETE:`);
        console.log(`📊 - Generated ${assignments.length} assignments`);
        console.log(`📊 - Found ${conflicts.length} conflicts`);
        console.log(`📊 - Residents working 3 days: ${Array.from(weeklyWorkCounts.values()).filter(count => count === 3).length}`);
        console.log(`📊 - Residents working 2 days: ${Array.from(weeklyWorkCounts.values()).filter(count => count === 2).length}`);
        console.log(`📊 - Residents working 1 day: ${Array.from(weeklyWorkCounts.values()).filter(count => count === 1).length}`);
        // Create all assignments at once
        let actuallyCreated = 0;
        if (assignments.length > 0) {
            try {
                const createResult = await prisma.shiftAssignment.createMany({
                    data: assignments
                });
                actuallyCreated = createResult.count;
                console.log(`📊 - Successfully created ${actuallyCreated} assignments`);
            }
            catch (error) {
                console.error('💥 Error creating assignments:', error);
                // Fallback to individual creation
                console.log('🔄 Falling back to individual creation...');
                for (const assignment of assignments) {
                    try {
                        await prisma.shiftAssignment.create({
                            data: assignment
                        });
                        actuallyCreated++;
                    }
                    catch (individualError) {
                        console.error('💥 Individual assignment failed:', individualError.message);
                        conflicts.push({
                            residentId: assignment.residentId,
                            conflictDate: assignment.assignedDate,
                            conflictType: 'assignment_creation_failed',
                            description: `Failed to create assignment: ${individualError.message}`,
                            severity: 'error'
                        });
                    }
                }
            }
        }
        // Create conflict records
        let conflictsCreated = 0;
        if (conflicts.length > 0) {
            try {
                const conflictResult = await prisma.scheduleConflict.createMany({
                    data: conflicts,
                    skipDuplicates: true
                });
                conflictsCreated = conflictResult.count;
                console.log(`📊 - Created ${conflictsCreated} conflict records`);
            }
            catch (error) {
                console.error('💥 Error creating conflicts:', error);
            }
        }
        // Return results with work distribution stats
        const period = await prisma.schedulePeriod.findUnique({
            where: { id: parseInt(schedulePeriodId) },
            include: {
                assignments: {
                    include: {
                        shift: {
                            include: {
                                department: true
                            }
                        },
                        resident: true
                    }
                }
            }
        });
        const workDistribution = {
            threeDay: Array.from(weeklyWorkCounts.values()).filter(count => count === 3).length,
            twoDay: Array.from(weeklyWorkCounts.values()).filter(count => count === 2).length,
            oneDay: Array.from(weeklyWorkCounts.values()).filter(count => count === 1).length,
            noWork: residents.length - Array.from(weeklyWorkCounts.values()).filter(count => count > 0).length
        };
        const finalStats = {
            assignmentsGenerated: assignments.length,
            assignmentsCreated: actuallyCreated,
            conflictsFound: conflicts.length,
            conflictsCreated: conflictsCreated,
            workDistribution: workDistribution
        };
        console.log('📊 FINAL STATS:', finalStats);
        res.json({
            success: true,
            period,
            stats: finalStats
        });
    }
    catch (error) {
        console.error('💥 Error generating schedule:', error);
        res.status(500).json({
            error: 'Failed to generate schedule',
            details: error.message
        });
    }
});
app.get('/api/schedule-periods/:id/assignments', async (req, res) => {
    try {
        const { id } = req.params;
        const assignments = await prisma.shiftAssignment.findMany({
            where: { schedulePeriodId: parseInt(id) },
            include: {
                shift: {
                    include: {
                        department: true
                    }
                },
                resident: true
            },
            orderBy: [
                { assignedDate: 'asc' },
                { shift: { startTime: 'asc' } }
            ]
        });
        res.json(assignments);
    }
    catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ error: 'Failed to fetch assignments' });
    }
});
app.get('/api/schedule-periods/:id/conflicts', async (req, res) => {
    try {
        const { id } = req.params;
        const start = new Date(req.query.startDate);
        const end = new Date(req.query.endDate);
        const conflicts = await prisma.scheduleConflict.findMany({
            where: {
                conflictDate: {
                    gte: start,
                    lte: end
                }
            },
            orderBy: {
                conflictDate: 'asc'
            }
        });
        res.json(conflicts);
    }
    catch (error) {
        console.error('Error fetching conflicts:', error);
        res.status(500).json({ error: 'Failed to fetch conflicts' });
    }
});
app.put('/api/shift-assignments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { residentId, roleTitle, notes, status } = req.body;
        const assignment = await prisma.shiftAssignment.update({
            where: { id: parseInt(id) },
            data: {
                residentId: residentId ? parseInt(residentId) : undefined,
                roleTitle,
                notes,
                status
            },
            include: {
                shift: {
                    include: {
                        department: true
                    }
                },
                resident: true
            }
        });
        res.json(assignment);
    }
    catch (error) {
        console.error('Error updating assignment:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Assignment not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to update assignment' });
        }
    }
});
app.delete('/api/shift-assignments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.shiftAssignment.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Assignment deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting assignment:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Assignment not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to delete assignment' });
        }
    }
});
// Appointment Types routes
app.get('/api/appointment-types', async (req, res) => {
    try {
        const types = await prisma.appointmentType.findMany({
            include: {
                appointments: {
                    where: { isActive: true }
                }
            },
            orderBy: {
                priority: 'desc'
            }
        });
        res.json(types);
    }
    catch (error) {
        console.error('Error fetching appointment types:', error);
        res.status(500).json({ error: 'Failed to fetch appointment types' });
    }
});
app.post('/api/appointment-types', async (req, res) => {
    try {
        const { name, description, priority } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        const type = await prisma.appointmentType.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                priority: priority || 0
            }
        });
        res.status(201).json(type);
    }
    catch (error) {
        console.error('Error creating appointment type:', error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'Appointment type name already exists' });
        }
        else {
            res.status(500).json({ error: 'Failed to create appointment type' });
        }
    }
});
// ===== APPOINTMENTS ROUTES - SPECIFIC ROUTES FIRST =====
// BULK RECURRING APPOINTMENTS (SPECIFIC ROUTE)
app.post('/api/appointments/bulk-recurring', async (req, res) => {
    try {
        const { residentId, appointmentTypeId, title, startTime, endTime, daysOfWeek, startDate, endDate, notes } = req.body;
        if (!residentId || !appointmentTypeId || !title || !startTime || !endTime || !daysOfWeek || !startDate || !endDate) {
            return res.status(400).json({ error: 'All fields are required for recurring appointments' });
        }
        // Create a unique recurring pattern that includes timestamp for series identification
        const seriesId = `weekly_${daysOfWeek.join('')}_${Date.now()}_${residentId}`;
        function parsePacificTime(dateString) {
            const cleanString = dateString.replace('Z', '');
            const date = new Date(cleanString);
            const pacificOffset = 7 * 60; // 7 hours in minutes for PDT
            const adjustedDate = new Date(date.getTime() + (pacificOffset * 60 * 1000));
            return adjustedDate;
        }
        const appointments = [];
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        console.log('=== RECURRING APPOINTMENTS DEBUG ===');
        console.log('Creating recurring appointments from', startDate, 'to', endDate);
        console.log('Time slot:', startTime, '-', endTime);
        console.log('Days of week:', daysOfWeek);
        console.log('Series ID:', seriesId);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (daysOfWeek.includes(d.getDay())) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const startDateTimeString = `${year}-${month}-${day}T${startTime}:00`;
                const endDateTimeString = `${year}-${month}-${day}T${endTime}:00`;
                const startDateTime = parsePacificTime(startDateTimeString);
                const endDateTime = parsePacificTime(endDateTimeString);
                appointments.push({
                    residentId: parseInt(residentId),
                    appointmentTypeId: parseInt(appointmentTypeId),
                    title: title.trim(),
                    startDateTime,
                    endDateTime,
                    isRecurring: true,
                    recurringPattern: seriesId, // Use unique series ID
                    notes: notes?.trim() || null
                });
            }
        }
        if (appointments.length > 0) {
            await prisma.appointment.createMany({
                data: appointments
            });
        }
        res.status(201).json({
            message: 'Recurring appointments created successfully',
            count: appointments.length,
            seriesId: seriesId
        });
    }
    catch (error) {
        console.error('Error creating recurring appointments:', error);
        res.status(500).json({ error: 'Failed to create recurring appointments' });
    }
});
// UPDATE RECURRING SERIES (SPECIFIC ROUTE)
app.put('/api/appointments/recurring-series', async (req, res) => {
    try {
        const { recurringPattern, residentId, appointmentTypeId, title, startTime, endTime, notes, updateFutureOnly = true } = req.body;
        console.log('=== UPDATE RECURRING SERIES ===');
        console.log('Request body:', req.body);
        if (!recurringPattern || !residentId) {
            return res.status(400).json({ error: 'Recurring pattern and resident ID are required' });
        }
        // Find all appointments in this recurring series
        const whereClause = {
            residentId: parseInt(residentId),
            recurringPattern: recurringPattern,
            isRecurring: true,
            isActive: true
        };
        if (updateFutureOnly) {
            whereClause.startDateTime = {
                gte: new Date() // Only update future appointments
            };
        }
        const appointmentsToUpdate = await prisma.appointment.findMany({
            where: whereClause,
            include: {
                resident: { select: { firstName: true, lastName: true } },
                appointmentType: true
            }
        });
        console.log(`Found ${appointmentsToUpdate.length} appointments to update`);
        if (appointmentsToUpdate.length === 0) {
            return res.status(404).json({ error: 'No appointments found in this recurring series' });
        }
        function parsePacificTime(dateString) {
            const cleanString = dateString.replace('Z', '');
            const date = new Date(cleanString);
            const pacificOffset = 7 * 60;
            const adjustedDate = new Date(date.getTime() + (pacificOffset * 60 * 1000));
            return adjustedDate;
        }
        const updatedAppointments = [];
        for (const appointment of appointmentsToUpdate) {
            const appointmentDate = new Date(appointment.startDateTime);
            const dateStr = appointmentDate.toISOString().split('T')[0];
            const newStartDateTime = parsePacificTime(`${dateStr}T${startTime}:00`);
            const newEndDateTime = parsePacificTime(`${dateStr}T${endTime}:00`);
            const updateData = {
                startDateTime: newStartDateTime,
                endDateTime: newEndDateTime
            };
            if (appointmentTypeId)
                updateData.appointmentTypeId = parseInt(appointmentTypeId);
            if (title)
                updateData.title = title.trim();
            if (notes !== undefined)
                updateData.notes = notes?.trim() || null;
            const updated = await prisma.appointment.update({
                where: { id: appointment.id },
                data: updateData,
                include: {
                    resident: { select: { firstName: true, lastName: true } },
                    appointmentType: true
                }
            });
            updatedAppointments.push(updated);
        }
        console.log(`Updated ${updatedAppointments.length} appointments`);
        res.json({
            message: `Updated ${updatedAppointments.length} appointments in recurring series`,
            updatedCount: updatedAppointments.length,
            appointments: updatedAppointments
        });
    }
    catch (error) {
        console.error('Error updating recurring series:', error);
        res.status(500).json({ error: 'Failed to update recurring series' });
    }
});
// DELETE RECURRING SERIES (SPECIFIC ROUTE)
app.delete('/api/appointments/recurring-series', async (req, res) => {
    console.log('🔴 DELETE RECURRING SERIES ROUTE HIT');
    console.log('🔴 Request body:', req.body);
    try {
        const { recurringPattern, residentId } = req.body;
        console.log('🔴 Extracted data:');
        console.log('🔴 - recurringPattern:', recurringPattern);
        console.log('🔴 - residentId:', residentId);
        if (!recurringPattern || !residentId) {
            console.log('🔴 VALIDATION FAILED - Missing required fields');
            return res.status(400).json({
                error: 'Recurring pattern and resident ID are required',
                received: { recurringPattern, residentId }
            });
        }
        console.log('🔴 VALIDATION PASSED - Proceeding with database queries');
        // Check what appointments exist with this exact pattern
        console.log('🔴 Searching for appointments with pattern:', recurringPattern);
        const existingAppointments = await prisma.appointment.findMany({
            where: {
                residentId: parseInt(residentId),
                recurringPattern: recurringPattern,
                isRecurring: true,
                isActive: true
            },
            select: {
                id: true,
                title: true,
                startDateTime: true,
                recurringPattern: true,
                isRecurring: true,
                isActive: true,
                residentId: true
            }
        });
        console.log('🔴 Found existing appointments:', existingAppointments.length);
        console.log('🔴 Appointment details:');
        existingAppointments.forEach((apt, index) => {
            console.log(`🔴   ${index + 1}. ID: ${apt.id}, Title: ${apt.title}`);
            console.log(`🔴      Pattern: "${apt.recurringPattern}"`);
            console.log(`🔴      Start: ${apt.startDateTime}`);
        });
        if (existingAppointments.length === 0) {
            console.log('🔴 NO APPOINTMENTS FOUND - Checking similar patterns...');
            // Debug: Check all appointments for this resident
            const allResidentAppointments = await prisma.appointment.findMany({
                where: {
                    residentId: parseInt(residentId),
                    isActive: true
                },
                select: {
                    id: true,
                    title: true,
                    recurringPattern: true,
                    isRecurring: true
                }
            });
            console.log('🔴 ALL appointments for resident', residentId, ':', allResidentAppointments.length);
            allResidentAppointments.forEach((apt, index) => {
                console.log(`🔴   ${index + 1}. ID: ${apt.id}, Title: "${apt.title}"`);
                console.log(`🔴      Pattern: "${apt.recurringPattern}"`);
                console.log(`🔴      Is Recurring: ${apt.isRecurring}`);
                console.log(`🔴      Pattern Match: ${apt.recurringPattern === recurringPattern}`);
                console.log(`🔴      Pattern length: ${apt.recurringPattern?.length} vs ${recurringPattern?.length}`);
            });
            return res.json({
                message: 'No appointments found with this recurring pattern',
                deletedCount: 0,
                searchedPattern: recurringPattern,
                searchedResidentId: residentId,
                totalAppointmentsForResident: allResidentAppointments.length,
                availablePatterns: allResidentAppointments
                    .map(apt => apt.recurringPattern)
                    .filter(Boolean)
                    .filter((pattern, index, self) => self.indexOf(pattern) === index) // Unique patterns
            });
        }
        // Get current time for future filtering
        const now = new Date();
        console.log('🔴 Current time:', now.toISOString());
        // Find future appointments (including today)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        const futureAppointments = existingAppointments.filter(apt => {
            const aptDate = new Date(apt.startDateTime);
            const isFutureOrToday = aptDate >= today; // Include today's appointments
            console.log(`🔴   Appointment ${apt.id}: ${apt.startDateTime} is future/today? ${isFutureOrToday}`);
            return isFutureOrToday;
        });
        console.log('🔴 Future/today appointments to delete:', futureAppointments.length);
        if (futureAppointments.length === 0) {
            return res.json({
                message: 'No future appointments found in this recurring series',
                deletedCount: 0,
                totalFound: existingAppointments.length,
                allInPast: true
            });
        }
        // Perform the deletion - FIXED: Use today instead of now for the date filter
        console.log('🔴 Performing deletion...');
        const deleteResult = await prisma.appointment.updateMany({
            where: {
                residentId: parseInt(residentId),
                recurringPattern: recurringPattern,
                isRecurring: true,
                startDateTime: {
                    gte: today // Use start of today instead of exact now
                },
                isActive: true
            },
            data: {
                isActive: false
            }
        });
        console.log('🔴 Delete result:', deleteResult);
        // Verify deletion
        const remainingActive = await prisma.appointment.count({
            where: {
                residentId: parseInt(residentId),
                recurringPattern: recurringPattern,
                isRecurring: true,
                startDateTime: {
                    gte: today
                },
                isActive: true
            }
        });
        console.log('🔴 Remaining active future appointments:', remainingActive);
        const finalResponse = {
            message: `Successfully deleted ${deleteResult.count} future appointments from recurring series`,
            deletedCount: deleteResult.count,
            totalFound: existingAppointments.length,
            futureFound: futureAppointments.length,
            remainingActive: remainingActive
        };
        console.log('🔴 Sending final response:', finalResponse);
        console.log('🔴 DELETE ROUTE - END SUCCESS');
        return res.json(finalResponse);
    }
    catch (error) {
        console.error('🔴 ERROR in delete route:', error);
        console.error('🔴 Error message:', error.message);
        console.error('🔴 Error stack:', error.stack);
        return res.status(500).json({
            error: 'Failed to delete appointment series',
            details: error.message
        });
    }
});
// GET ALL APPOINTMENTS (GENERAL ROUTE)
app.get('/api/appointments', async (req, res) => {
    try {
        const { residentId, startDate, endDate } = req.query;
        const where = { isActive: true };
        if (residentId) {
            where.residentId = parseInt(residentId);
        }
        if (startDate && endDate) {
            where.startDateTime = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }
        const appointments = await prisma.appointment.findMany({
            where,
            include: {
                resident: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                },
                appointmentType: true
            },
            orderBy: [
                { startDateTime: 'asc' }
            ]
        });
        res.json(appointments);
    }
    catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});
// CREATE SINGLE APPOINTMENT (GENERAL ROUTE)
app.post('/api/appointments', async (req, res) => {
    try {
        const { residentId, appointmentTypeId, title, startDateTime, endDateTime, isRecurring, recurringPattern, notes } = req.body;
        if (!residentId || !appointmentTypeId || !title || !startDateTime || !endDateTime) {
            return res.status(400).json({ error: 'Resident, appointment type, title, start time, and end time are required' });
        }
        // Function to treat input as Pacific Time and store it properly
        function parsePacificTime(dateString) {
            const cleanString = dateString.replace('Z', '');
            const date = new Date(cleanString);
            // California is UTC-8 (PST) or UTC-7 (PDT)
            // For simplicity, let's use UTC-7 (PDT) since it's summer
            const pacificOffset = 7 * 60; // 7 hours in minutes
            // Add the offset to store the "local" time as if it were UTC
            const adjustedDate = new Date(date.getTime() + (pacificOffset * 60 * 1000));
            return adjustedDate;
        }
        const startDate = parsePacificTime(startDateTime);
        const endDate = parsePacificTime(endDateTime);
        console.log('=== TIMEZONE OFFSET FIX ===');
        console.log('Received startDateTime:', startDateTime);
        console.log('Original Date object:', new Date(startDateTime).toString());
        console.log('Adjusted for Pacific Time:', startDate.toString());
        console.log('Storing as UTC:', startDate.toISOString());
        console.log('========================');
        // Check for overlapping appointments
        const overlapping = await prisma.appointment.findFirst({
            where: {
                residentId: parseInt(residentId),
                isActive: true,
                OR: [
                    {
                        startDateTime: {
                            lt: endDate
                        },
                        endDateTime: {
                            gt: startDate
                        }
                    }
                ]
            }
        });
        if (overlapping) {
            return res.status(400).json({ error: 'Appointment overlaps with existing appointment' });
        }
        const appointment = await prisma.appointment.create({
            data: {
                residentId: parseInt(residentId),
                appointmentTypeId: parseInt(appointmentTypeId),
                title: title.trim(),
                startDateTime: startDate,
                endDateTime: endDate,
                isRecurring: isRecurring || false,
                recurringPattern: recurringPattern?.trim() || null,
                notes: notes?.trim() || null
            },
            include: {
                resident: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                },
                appointmentType: true
            }
        });
        res.status(201).json(appointment);
    }
    catch (error) {
        console.error('Error creating appointment:', error);
        res.status(500).json({ error: 'Failed to create appointment' });
    }
});
// UPDATE SINGLE APPOINTMENT (PARAMETERIZED ROUTE)
app.put('/api/appointments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { residentId, appointmentTypeId, title, startDateTime, endDateTime, isRecurring, recurringPattern, notes } = req.body;
        if (!residentId || !appointmentTypeId || !title || !startDateTime || !endDateTime) {
            return res.status(400).json({ error: 'Resident, appointment type, title, start time, and end time are required' });
        }
        // Use the SAME function as in your create route
        function parsePacificTime(dateString) {
            const cleanString = dateString.replace('Z', '');
            const date = new Date(cleanString);
            // California is UTC-8 (PST) or UTC-7 (PDT)
            // For simplicity, let's use UTC-7 (PDT) since it's summer
            const pacificOffset = 7 * 60; // 7 hours in minutes
            // Add the offset to store the "local" time as if it were UTC
            const adjustedDate = new Date(date.getTime() + (pacificOffset * 60 * 1000));
            return adjustedDate;
        }
        const startDate = parsePacificTime(startDateTime);
        const endDate = parsePacificTime(endDateTime);
        console.log('=== UPDATE TIMEZONE OFFSET FIX ===');
        console.log('Received startDateTime:', startDateTime);
        console.log('Original Date object:', new Date(startDateTime).toString());
        console.log('Adjusted for Pacific Time:', startDate.toString());
        console.log('Storing as UTC:', startDate.toISOString());
        console.log('===============================');
        // Check for overlapping appointments (excluding current appointment)
        const overlapping = await prisma.appointment.findFirst({
            where: {
                residentId: parseInt(residentId),
                isActive: true,
                id: { not: parseInt(id) },
                OR: [
                    {
                        startDateTime: {
                            lt: endDate
                        },
                        endDateTime: {
                            gt: startDate
                        }
                    }
                ]
            }
        });
        if (overlapping) {
            return res.status(400).json({ error: 'Appointment overlaps with existing appointment' });
        }
        const appointment = await prisma.appointment.update({
            where: { id: parseInt(id) },
            data: {
                residentId: parseInt(residentId),
                appointmentTypeId: parseInt(appointmentTypeId),
                title: title.trim(),
                startDateTime: startDate,
                endDateTime: endDate,
                isRecurring: isRecurring || false,
                recurringPattern: recurringPattern?.trim() || null,
                notes: notes?.trim() || null
            },
            include: {
                resident: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                },
                appointmentType: true
            }
        });
        res.json(appointment);
    }
    catch (error) {
        console.error('Error updating appointment:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Appointment not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to update appointment' });
        }
    }
});
// DELETE SINGLE APPOINTMENT (PARAMETERIZED ROUTE)
app.delete('/api/appointments/:id', async (req, res) => {
    console.log('🔴 SINGLE APPOINTMENT DELETE ROUTE HIT');
    console.log('🔴 ID from params:', req.params.id);
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Appointment ID is required' });
        }
        const appointmentId = parseInt(id);
        if (isNaN(appointmentId)) {
            return res.status(400).json({ error: 'Invalid appointment ID format' });
        }
        console.log('🔴 Parsed appointment ID:', appointmentId);
        // Check if appointment exists first
        const existingAppointment = await prisma.appointment.findUnique({
            where: { id: appointmentId }
        });
        if (!existingAppointment) {
            console.log('🔴 ERROR: Appointment not found');
            return res.status(404).json({ error: 'Appointment not found' });
        }
        console.log('🔴 Found appointment:', existingAppointment.title);
        // Soft delete - set isActive to false
        const appointment = await prisma.appointment.update({
            where: { id: appointmentId },
            data: { isActive: false }
        });
        console.log('🔴 Successfully deleted appointment');
        res.json({ message: 'Appointment deleted successfully', appointment });
    }
    catch (error) {
        console.error('🔴 Error deleting single appointment:', error);
        console.error('🔴 Error message:', error.message);
        console.error('🔴 Error stack:', error.stack);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Appointment not found' });
        }
        else {
            res.status(500).json({
                error: 'Failed to delete appointment',
                details: error.message
            });
        }
    }
});
// Add these routes to your backend server file (paste-3.txt)
// Add them after your existing routes, before the error handling middleware
// Work Limits routes
app.get('/api/work-limits', async (req, res) => {
    try {
        const workLimits = await prisma.workLimit.findMany({
            where: { isActive: true },
            include: {
                resident: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                }
            },
            orderBy: [
                { residentId: 'asc' }, // Global limits first (null values)
                { limitType: 'asc' }
            ]
        });
        res.json(workLimits);
    }
    catch (error) {
        console.error('Error fetching work limits:', error);
        res.status(500).json({ error: 'Failed to fetch work limits' });
    }
});
app.post('/api/work-limits', async (req, res) => {
    try {
        const { residentId, limitType, maxValue, reason } = req.body;
        if (!limitType || !maxValue) {
            return res.status(400).json({ error: 'Limit type and max value are required' });
        }
        if (maxValue < 1 || maxValue > 7) {
            return res.status(400).json({ error: 'Max value must be between 1 and 7' });
        }
        // Check if a similar limit already exists
        const existingLimit = await prisma.workLimit.findFirst({
            where: {
                residentId: residentId || null,
                limitType: limitType,
                isActive: true
            }
        });
        if (existingLimit) {
            return res.status(400).json({
                error: `A ${limitType} limit already exists for this ${residentId ? 'resident' : 'global setting'}`
            });
        }
        const workLimit = await prisma.workLimit.create({
            data: {
                residentId: residentId || null,
                limitType: limitType,
                maxValue: maxValue,
                reason: reason?.trim() || null
            },
            include: {
                resident: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });
        res.status(201).json(workLimit);
    }
    catch (error) {
        console.error('Error creating work limit:', error);
        res.status(500).json({ error: 'Failed to create work limit' });
    }
});
// Replace your existing PUT route with this fixed version:
app.put('/api/work-limits/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { residentId, limitType, maxValue, reason } = req.body;
        if (!limitType || !maxValue) {
            return res.status(400).json({ error: 'Limit type and max value are required' });
        }
        if (maxValue < 1 || maxValue > 7) {
            return res.status(400).json({ error: 'Max value must be between 1 and 7' });
        }
        // ADD THIS DUPLICATE CHECK (this was missing from your version):
        const existingLimit = await prisma.workLimit.findFirst({
            where: {
                id: { not: parseInt(id) },
                residentId: residentId || null,
                limitType: limitType,
                isActive: true
            }
        });
        if (existingLimit) {
            return res.status(400).json({
                error: `A ${limitType} limit already exists for this ${residentId ? 'resident' : 'global setting'}`
            });
        }
        // END OF ADDED DUPLICATE CHECK
        const workLimit = await prisma.workLimit.update({
            where: { id: parseInt(id) },
            data: {
                residentId: residentId || null,
                limitType: limitType,
                maxValue: maxValue,
                reason: reason?.trim() || null
            },
            include: {
                resident: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });
        res.json(workLimit);
    }
    catch (error) {
        console.error('Error updating work limit:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Work limit not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to update work limit' });
        }
    }
});
app.delete('/api/work-limits/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const workLimit = await prisma.workLimit.update({
            where: { id: parseInt(id) },
            data: { isActive: false }
        });
        res.json({ message: 'Work limit deleted successfully', workLimit });
    }
    catch (error) {
        console.error('Error deleting work limit:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Work limit not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to delete work limit' });
        }
    }
});
// Add these additional routes after the ones you already added
// Helper function to get work limits for a resident
app.get('/api/residents/:id/work-limits', async (req, res) => {
    try {
        const { id } = req.params;
        // Get individual limits for this resident
        const individualLimits = await prisma.workLimit.findMany({
            where: {
                residentId: parseInt(id),
                isActive: true
            }
        });
        // Get global limits (where residentId is null)
        const globalLimits = await prisma.workLimit.findMany({
            where: {
                residentId: null,
                isActive: true
            }
        });
        // Combine and prioritize individual limits over global ones
        const effectiveLimits = [...individualLimits];
        // Add global limits only if no individual limit exists for that type
        globalLimits.forEach(globalLimit => {
            const hasIndividualLimit = individualLimits.some(individualLimit => individualLimit.limitType === globalLimit.limitType);
            if (!hasIndividualLimit) {
                effectiveLimits.push(globalLimit);
            }
        });
        res.json({
            individualLimits,
            globalLimits,
            effectiveLimits
        });
    }
    catch (error) {
        console.error('Error fetching resident work limits:', error);
        res.status(500).json({ error: 'Failed to fetch resident work limits' });
    }
});
// Get work limit statistics
app.get('/api/work-limits/stats', async (req, res) => {
    try {
        const totalLimits = await prisma.workLimit.count({
            where: { isActive: true }
        });
        const globalLimits = await prisma.workLimit.count({
            where: {
                residentId: null,
                isActive: true
            }
        });
        const individualLimits = await prisma.workLimit.count({
            where: {
                residentId: { not: null },
                isActive: true
            }
        });
        const limitsByType = await prisma.workLimit.groupBy({
            by: ['limitType'],
            where: { isActive: true },
            _count: true
        });
        res.json({
            totalLimits,
            globalLimits,
            individualLimits,
            limitsByType
        });
    }
    catch (error) {
        console.error('Error fetching work limit stats:', error);
        res.status(500).json({ error: 'Failed to fetch work limit stats' });
    }
});
// Enhanced function to check work limits during scheduling
async function checkWorkLimits(residentId, limitType, currentValue) {
    try {
        // Get individual limit first
        const individualLimit = await prisma.workLimit.findFirst({
            where: {
                residentId: residentId,
                limitType: limitType,
                isActive: true
            }
        });
        if (individualLimit) {
            return currentValue < individualLimit.maxValue;
        }
        // Check global limit if no individual limit exists
        const globalLimit = await prisma.workLimit.findFirst({
            where: {
                residentId: null,
                limitType: limitType,
                isActive: true
            }
        });
        if (globalLimit) {
            return currentValue < globalLimit.maxValue;
        }
        // Default fallback limits if no limits are set
        const defaultLimits = {
            'weekly_days': 3,
            'daily_hours': 8,
            'monthly_days': 15
        };
        return currentValue < (defaultLimits[limitType] || 3);
    }
    catch (error) {
        console.error('Error checking work limits:', error);
        // Default to 3-day limit if error occurs
        return currentValue < 3;
    }
}
// Validation endpoint to check if a work assignment would violate limits
app.post('/api/work-limits/validate', async (req, res) => {
    try {
        const { residentId, limitType, currentValue } = req.body;
        if (!residentId || !limitType || currentValue === undefined) {
            return res.status(400).json({ error: 'Resident ID, limit type, and current value are required' });
        }
        const isValid = await checkWorkLimits(residentId, limitType, currentValue);
        res.json({
            isValid,
            currentValue,
            limitType,
            residentId
        });
    }
    catch (error) {
        console.error('Error validating work limits:', error);
        res.status(500).json({ error: 'Failed to validate work limits' });
    }
});
// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit();
});
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await prisma.$disconnect();
    process.exit();
});
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
