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
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Basic health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
// Add rate limiting for login attempts
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
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
// Add these routes to your server.ts (before other routes):
// Auth routes
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        // Check if this is the initial setup (no admin user exists)
        const adminExists = await prisma.systemSetting.findUnique({
            where: { key: 'admin_setup_complete' }
        });
        if (!adminExists) {
            return res.status(400).json({
                error: 'System not initialized',
                requiresSetup: true
            });
        }
        // Get admin credentials from system settings
        const [adminUsername, adminPasswordHash] = await Promise.all([
            prisma.systemSetting.findUnique({ where: { key: 'admin_username' } }),
            prisma.systemSetting.findUnique({ where: { key: 'admin_password_hash' } })
        ]);
        if (!adminUsername || !adminPasswordHash) {
            return res.status(500).json({ error: 'Admin credentials not found' });
        }
        // Check username
        if (username !== adminUsername.value) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Check password
        const passwordValid = await bcryptjs_1.default.compare(password, adminPasswordHash.value);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Generate JWT token
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
// Initial setup route (only works if no admin exists)
app.post('/api/auth/setup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        // Check if setup is already complete
        const adminExists = await prisma.systemSetting.findUnique({
            where: { key: 'admin_setup_complete' }
        });
        if (adminExists) {
            return res.status(400).json({ error: 'System already initialized' });
        }
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcryptjs_1.default.hash(password, saltRounds);
        // Save admin credentials
        await prisma.systemSetting.createMany({
            data: [
                { key: 'admin_username', value: username },
                { key: 'admin_password_hash', value: passwordHash },
                { key: 'admin_setup_complete', value: 'true' }
            ]
        });
        // Generate initial token
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
// Check if setup is required
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
// Verify token endpoint
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({
        valid: true,
        user: req.user
    });
});
// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }
        // Get current password hash
        const adminPasswordHash = await prisma.systemSetting.findUnique({
            where: { key: 'admin_password_hash' }
        });
        if (!adminPasswordHash) {
            return res.status(500).json({ error: 'Admin credentials not found' });
        }
        // Verify current password
        const passwordValid = await bcryptjs_1.default.compare(currentPassword, adminPasswordHash.value);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        // Hash new password
        const saltRounds = 12;
        const newPasswordHash = await bcryptjs_1.default.hash(newPassword, saltRounds);
        // Update password
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
// Protect all other routes (add this AFTER the auth routes but BEFORE your existing routes)
app.use('/api', (req, res, next) => {
    // Skip auth for setup and login routes
    if (req.path.startsWith('/auth/')) {
        return next();
    }
    // Apply authentication to all other API routes
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
        // Validation
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
        // Validation
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
        // Soft delete - set isActive to false instead of actually deleting
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
// Get single resident
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
        // Check if qualification is in use
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
        // Check if resident already has this qualification
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
        // Soft delete - set isActive to false
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
// Get all residents with their qualifications (useful for assignment overview)
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
// Add these routes to your existing server.ts file (after the qualifications routes)
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
                priority: 'desc' // Higher priority first (kitchen = highest)
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
        // Check if department has shifts
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
        // Delete existing roles and create new ones
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
        // Soft delete - set isActive to false
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
// Add these routes to your existing server.ts file (after the shifts routes)
// Schedule generation and management routes
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
app.post('/api/generate-schedule', async (req, res) => {
    try {
        const { schedulePeriodId, startDate, endDate } = req.body;
        if (!schedulePeriodId || !startDate || !endDate) {
            return res.status(400).json({ error: 'Schedule period ID, start date, and end date are required' });
        }
        // Clear existing assignments for this period
        await prisma.shiftAssignment.deleteMany({
            where: { schedulePeriodId: parseInt(schedulePeriodId) }
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
                { department: { priority: 'desc' } }, // Kitchen first (highest priority)
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
        // Generate date range
        const start = new Date(startDate);
        const end = new Date(endDate);
        const dates = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
        }
        const assignments = [];
        const conflicts = [];
        const usedResidents = new Set(); // Track residents assigned each day
        // Process each date
        for (const date of dates) {
            const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const dayUsed = new Set(); // Track residents used on this specific day
            // Get shifts that run on this day
            const dayShifts = shifts.filter(shift => {
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                return shift[days[dayOfWeek]] === true;
            });
            // Process shifts by department priority
            for (const shift of dayShifts) {
                for (const role of shift.roles) {
                    for (let i = 0; i < role.requiredCount; i++) {
                        // Find eligible residents for this role
                        const eligibleResidents = residents.filter(resident => {
                            // Check if already assigned this day
                            if (dayUsed.has(resident.id))
                                return false;
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
                            if (!dayAvailability)
                                return false;
                            const shiftStart = new Date(`2000-01-01T${shift.startTime}:00`);
                            const shiftEnd = new Date(`2000-01-01T${shift.endTime}:00`);
                            const availStart = new Date(`2000-01-01T${dayAvailability.startTime}:00`);
                            const availEnd = new Date(`2000-01-01T${dayAvailability.endTime}:00`);
                            if (shiftStart < availStart || shiftEnd > availEnd)
                                return false;
                            // Check appointment conflicts
                            const shiftDateTime = new Date(date);
                            const shiftStartTime = new Date(date);
                            const shiftEndTime = new Date(date);
                            shiftStartTime.setHours(parseInt(shift.startTime.split(':')[0]), parseInt(shift.startTime.split(':')[1]));
                            shiftEndTime.setHours(parseInt(shift.endTime.split(':')[0]), parseInt(shift.endTime.split(':')[1]));
                            const conflictingAppointments = resident.appointments.filter(apt => {
                                const aptStart = new Date(apt.startDateTime);
                                const aptEnd = new Date(apt.endDateTime);
                                const aptDate = new Date(aptStart.getFullYear(), aptStart.getMonth(), aptStart.getDate());
                                const currentDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                                if (aptDate.getTime() !== currentDate.getTime())
                                    return false;
                                // Check different types of conflicts
                                if (shift.blocksCounselingOnly && apt.appointmentType.name === 'counseling')
                                    return true;
                                if (shift.blocksAllAppointments)
                                    return true;
                                // Time overlap check for other appointments
                                return (aptStart < shiftEndTime && aptEnd > shiftStartTime);
                            });
                            return conflictingAppointments.length === 0;
                        });
                        // Assign best candidate
                        if (eligibleResidents.length > 0) {
                            // Prefer residents with fewer existing assignments (load balancing)
                            const sortedCandidates = eligibleResidents.sort((a, b) => {
                                const aAssignments = assignments.filter(assign => assign.residentId === a.id).length;
                                const bAssignments = assignments.filter(assign => assign.residentId === b.id).length;
                                return aAssignments - bAssignments;
                            });
                            const selectedResident = sortedCandidates[0];
                            assignments.push({
                                schedulePeriodId: parseInt(schedulePeriodId),
                                shiftId: shift.id,
                                residentId: selectedResident.id,
                                assignedDate: date,
                                roleTitle: role.roleTitle,
                                status: 'scheduled'
                            });
                            dayUsed.add(selectedResident.id);
                        }
                        else {
                            // Record conflict - no eligible residents
                            conflicts.push({
                                residentId: 0, // Use 0 instead of null
                                conflictDate: date,
                                conflictType: 'no_eligible_residents',
                                description: `No eligible residents for ${shift.name} - ${role.roleTitle}`,
                                severity: 'error'
                            });
                        }
                    }
                }
            }
        }
        // Bulk create assignments
        if (assignments.length > 0) {
            await prisma.shiftAssignment.createMany({
                data: assignments
            });
        }
        // Create conflict records
        if (conflicts.length > 0) {
            await prisma.scheduleConflict.createMany({
                data: conflicts
            });
        }
        // Return results
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
        res.json({
            success: true,
            period,
            stats: {
                assignmentsCreated: assignments.length,
                conflictsFound: conflicts.length
            }
        });
    }
    catch (error) {
        console.error('Error generating schedule:', error);
        res.status(500).json({ error: 'Failed to generate schedule' });
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
// Add these routes to your existing server.ts file (after the schedule routes)
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
// Appointments routes
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
app.post('/api/appointments', async (req, res) => {
    try {
        const { residentId, appointmentTypeId, title, startDateTime, endDateTime, isRecurring, recurringPattern, notes } = req.body;
        if (!residentId || !appointmentTypeId || !title || !startDateTime || !endDateTime) {
            return res.status(400).json({ error: 'Resident, appointment type, title, start time, and end time are required' });
        }
        // Check for overlapping appointments
        const overlapping = await prisma.appointment.findFirst({
            where: {
                residentId: parseInt(residentId),
                isActive: true,
                OR: [
                    {
                        startDateTime: {
                            lt: new Date(endDateTime)
                        },
                        endDateTime: {
                            gt: new Date(startDateTime)
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
                startDateTime: new Date(startDateTime),
                endDateTime: new Date(endDateTime),
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
app.put('/api/appointments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { residentId, appointmentTypeId, title, startDateTime, endDateTime, isRecurring, recurringPattern, notes } = req.body;
        if (!residentId || !appointmentTypeId || !title || !startDateTime || !endDateTime) {
            return res.status(400).json({ error: 'Resident, appointment type, title, start time, and end time are required' });
        }
        // Check for overlapping appointments (excluding current appointment)
        const overlapping = await prisma.appointment.findFirst({
            where: {
                residentId: parseInt(residentId),
                isActive: true,
                id: { not: parseInt(id) },
                OR: [
                    {
                        startDateTime: {
                            lt: new Date(endDateTime)
                        },
                        endDateTime: {
                            gt: new Date(startDateTime)
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
                startDateTime: new Date(startDateTime),
                endDateTime: new Date(endDateTime),
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
app.delete('/api/appointments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Soft delete - set isActive to false
        const appointment = await prisma.appointment.update({
            where: { id: parseInt(id) },
            data: { isActive: false }
        });
        res.json({ message: 'Appointment deleted successfully', appointment });
    }
    catch (error) {
        console.error('Error deleting appointment:', error);
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Appointment not found' });
        }
        else {
            res.status(500).json({ error: 'Failed to delete appointment' });
        }
    }
});
// Bulk create recurring appointments
app.post('/api/appointments/bulk-recurring', async (req, res) => {
    try {
        const { residentId, appointmentTypeId, title, startTime, endTime, daysOfWeek, // Array of day numbers (0=Sunday, 1=Monday, etc.)
        startDate, endDate, notes } = req.body;
        if (!residentId || !appointmentTypeId || !title || !startTime || !endTime || !daysOfWeek || !startDate || !endDate) {
            return res.status(400).json({ error: 'All fields are required for recurring appointments' });
        }
        const appointments = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Generate all dates in the range
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (daysOfWeek.includes(d.getDay())) {
                const appointmentDate = new Date(d);
                const [startHour, startMinute] = startTime.split(':');
                const [endHour, endMinute] = endTime.split(':');
                const startDateTime = new Date(appointmentDate);
                startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
                const endDateTime = new Date(appointmentDate);
                endDateTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);
                appointments.push({
                    residentId: parseInt(residentId),
                    appointmentTypeId: parseInt(appointmentTypeId),
                    title: title.trim(),
                    startDateTime,
                    endDateTime,
                    isRecurring: true,
                    recurringPattern: `Weekly on ${daysOfWeek.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`,
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
            count: appointments.length
        });
    }
    catch (error) {
        console.error('Error creating recurring appointments:', error);
        res.status(500).json({ error: 'Failed to create recurring appointments' });
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
