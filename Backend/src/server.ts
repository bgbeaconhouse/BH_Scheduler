import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});


// Add rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// JWT verification middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Add these routes to your server.ts (before other routes):

function parseAsLocalDate(dateString: string): Date {
  // Remove any timezone indicators
  const cleanDateString = dateString.replace('Z', '').replace(/\+.*$/, '');
  
  // Parse as local time by treating it as if it's in the local timezone
  return new Date(cleanDateString);
}

// Auth routes
app.post('/api/auth/login', loginLimiter, async (req: any, res: any) => {
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
    const passwordValid = await bcrypt.compare(password, adminPasswordHash.value);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { username: adminUsername.value, role: 'admin' },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        username: adminUsername.value,
        role: 'admin'
      }
    });

  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Initial setup route (only works if no admin exists)
app.post('/api/auth/setup', async (req: any, res: any) => {
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
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Save admin credentials
    await prisma.systemSetting.createMany({
      data: [
        { key: 'admin_username', value: username },
        { key: 'admin_password_hash', value: passwordHash },
        { key: 'admin_setup_complete', value: 'true' }
      ]
    });

    // Generate initial token
    const token = jwt.sign(
      { username, role: 'admin' },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        username,
        role: 'admin'
      },
      message: 'Admin account created successfully'
    });

  } catch (error: any) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// Check if setup is required
app.get('/api/auth/setup-status', async (req: any, res: any) => {
  try {
    const adminExists = await prisma.systemSetting.findUnique({
      where: { key: 'admin_setup_complete' }
    });

    res.json({
      requiresSetup: !adminExists
    });
  } catch (error: any) {
    console.error('Setup status error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// Verify token endpoint
app.get('/api/auth/verify', authenticateToken, (req: any, res: any) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req: any, res: any) => {
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
    const passwordValid = await bcrypt.compare(currentPassword, adminPasswordHash.value);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.systemSetting.update({
      where: { key: 'admin_password_hash' },
      data: { value: newPasswordHash }
    });

    res.json({ message: 'Password changed successfully' });

  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Protect all other routes (add this AFTER the auth routes but BEFORE your existing routes)
app.use('/api', (req: any, res: any, next: any) => {
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
  } catch (error) {
    console.error('Error fetching residents:', error);
    res.status(500).json({ error: 'Failed to fetch residents' });
  }
});

app.post('/api/residents', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error creating resident:', error);
    res.status(500).json({ error: 'Failed to create resident' });
  }
});

app.put('/api/residents/:id', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error updating resident:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Resident not found' });
    } else {
      res.status(500).json({ error: 'Failed to update resident' });
    }
  }
});

app.delete('/api/residents/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    // Soft delete - set isActive to false instead of actually deleting
    const resident = await prisma.resident.update({
      where: { id: parseInt(id) },
      data: { isActive: false }
    });
    
    res.json({ message: 'Resident removed successfully', resident });
  } catch (error: any) {
    console.error('Error removing resident:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Resident not found' });
    } else {
      res.status(500).json({ error: 'Failed to remove resident' });
    }
  }
});

// Get single resident
app.get('/api/residents/:id', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching resident:', error);
    res.status(500).json({ error: 'Failed to fetch resident' });
  }
});

// Qualifications routes
app.get('/api/qualifications', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching qualifications:', error);
    res.status(500).json({ error: 'Failed to fetch qualifications' });
  }
});

app.post('/api/qualifications', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error creating qualification:', error);
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Qualification name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create qualification' });
    }
  }
});

app.put('/api/qualifications/:id', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error updating qualification:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Qualification not found' });
    } else if (error.code === 'P2002') {
      res.status(400).json({ error: 'Qualification name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update qualification' });
    }
  }
});

app.delete('/api/qualifications/:id', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error deleting qualification:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Qualification not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete qualification' });
    }
  }
});

// Resident qualifications routes
app.get('/api/residents/:id/qualifications', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching resident qualifications:', error);
    res.status(500).json({ error: 'Failed to fetch resident qualifications' });
  }
});

app.post('/api/residents/:id/qualifications', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error assigning qualification:', error);
    res.status(500).json({ error: 'Failed to assign qualification' });
  }
});

app.delete('/api/residents/:residentId/qualifications/:qualificationId', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error removing qualification:', error);
    res.status(500).json({ error: 'Failed to remove qualification' });
  }
});

// Get all residents with their qualifications (useful for assignment overview)
app.get('/api/residents-with-qualifications', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching residents with qualifications:', error);
    res.status(500).json({ error: 'Failed to fetch residents with qualifications' });
  }
});

// Add these routes to your existing server.ts file (after the qualifications routes)

// Departments routes
app.get('/api/departments', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

app.post('/api/departments', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error creating department:', error);
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Department name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create department' });
    }
  }
});

app.put('/api/departments/:id', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error updating department:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Department not found' });
    } else if (error.code === 'P2002') {
      res.status(400).json({ error: 'Department name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update department' });
    }
  }
});

app.delete('/api/departments/:id', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error deleting department:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Department not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete department' });
    }
  }
});

// Shifts routes
app.get('/api/shifts', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching shifts:', error);
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

app.post('/api/shifts', async (req: any, res: any) => {
  try {
    const { 
      departmentId, 
      name, 
      description, 
      startTime, 
      endTime,
      monday, tuesday, wednesday, thursday, friday, saturday, sunday,
      minTenureMonths,
      blocksAllAppointments,
      blocksCounselingOnly,
      allowsTemporaryLeave,
      roles 
    } = req.body;
    
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
          create: roles?.map((role: any) => ({
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
  } catch (error: any) {
    console.error('Error creating shift:', error);
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

app.put('/api/shifts/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { 
      departmentId, 
      name, 
      description, 
      startTime, 
      endTime,
      monday, tuesday, wednesday, thursday, friday, saturday, sunday,
      minTenureMonths,
      blocksAllAppointments,
      blocksCounselingOnly,
      allowsTemporaryLeave,
      roles 
    } = req.body;
    
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
          create: roles?.map((role: any) => ({
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
  } catch (error: any) {
    console.error('Error updating shift:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Shift not found' });
    } else {
      res.status(500).json({ error: 'Failed to update shift' });
    }
  }
});

app.delete('/api/shifts/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    // Soft delete - set isActive to false
    const shift = await prisma.shift.update({
      where: { id: parseInt(id) },
      data: { isActive: false }
    });
    
    res.json({ message: 'Shift deleted successfully', shift });
  } catch (error: any) {
    console.error('Error deleting shift:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Shift not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete shift' });
    }
  }
});

app.get('/api/shifts/:id', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching shift:', error);
    res.status(500).json({ error: 'Failed to fetch shift' });
  }
});

// Add these routes to your existing server.ts file (after the shifts routes)

// Schedule generation and management routes
app.get('/api/schedule-periods', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching schedule periods:', error);
    res.status(500).json({ error: 'Failed to fetch schedule periods' });
  }
});

app.post('/api/schedule-periods', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error creating schedule period:', error);
    res.status(500).json({ error: 'Failed to create schedule period' });
  }
});

app.post('/api/generate-schedule', async (req: any, res: any) => {
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

    const assignments: any[] = [];
    const conflicts: any[] = [];
    const usedResidents = new Set(); // Track residents assigned each day

    // Process each date
    for (const date of dates) {
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const dayUsed = new Set(); // Track residents used on this specific day
      
      // Get shifts that run on this day
      const dayShifts = shifts.filter(shift => {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        return shift[days[dayOfWeek] as keyof typeof shift] === true;
      });

      // Process shifts by department priority
      for (const shift of dayShifts) {
        for (const role of shift.roles) {
          for (let i = 0; i < role.requiredCount; i++) {
            // Find eligible residents for this role
            const eligibleResidents = residents.filter(resident => {
              // Check if already assigned this day
              if (dayUsed.has(resident.id)) return false;

              // Check tenure requirement
              if (shift.minTenureMonths > 0) {
                const admissionDate = new Date(resident.admissionDate);
                const monthsDiff = (date.getTime() - admissionDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
                if (monthsDiff < shift.minTenureMonths) return false;
              }

              // Check qualification requirement
              if (role.qualificationId) {
                const hasQualification = resident.qualifications.some(
                  rq => rq.qualificationId === role.qualificationId
                );
                if (!hasQualification) return false;
              }

              // Check availability
              const dayAvailability = resident.availability.find(a => a.dayOfWeek === dayOfWeek);
              if (!dayAvailability) return false;

              const shiftStart = new Date(`2000-01-01T${shift.startTime}:00`);
              const shiftEnd = new Date(`2000-01-01T${shift.endTime}:00`);
              const availStart = new Date(`2000-01-01T${dayAvailability.startTime}:00`);
              const availEnd = new Date(`2000-01-01T${dayAvailability.endTime}:00`);

              if (shiftStart < availStart || shiftEnd > availEnd) return false;

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
                
                if (aptDate.getTime() !== currentDate.getTime()) return false;

                // Check different types of conflicts
                if (shift.blocksCounselingOnly && apt.appointmentType.name === 'counseling') return true;
                if (shift.blocksAllAppointments) return true;
                
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
            } else {
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

  } catch (error: any) {
    console.error('Error generating schedule:', error);
    res.status(500).json({ error: 'Failed to generate schedule' });
  }
});

app.get('/api/schedule-periods/:id/assignments', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

app.get('/api/schedule-periods/:id/conflicts', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const start = new Date(req.query.startDate as string);
    const end = new Date(req.query.endDate as string);
    
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
  } catch (error: any) {
    console.error('Error fetching conflicts:', error);
    res.status(500).json({ error: 'Failed to fetch conflicts' });
  }
});

app.put('/api/shift-assignments/:id', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error updating assignment:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Assignment not found' });
    } else {
      res.status(500).json({ error: 'Failed to update assignment' });
    }
  }
});

app.delete('/api/shift-assignments/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    await prisma.shiftAssignment.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({ message: 'Assignment deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting assignment:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Assignment not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
  }
});

// Add these routes to your existing server.ts file (after the schedule routes)

// Appointment Types routes
app.get('/api/appointment-types', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error fetching appointment types:', error);
    res.status(500).json({ error: 'Failed to fetch appointment types' });
  }
});

app.post('/api/appointment-types', async (req: any, res: any) => {
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
  } catch (error: any) {
    console.error('Error creating appointment type:', error);
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Appointment type name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create appointment type' });
    }
  }
});

// Appointments routes
app.get('/api/appointments', async (req: any, res: any) => {
  try {
    const { residentId, startDate, endDate } = req.query;
    
    const where: any = { isActive: true };
    
    if (residentId) {
      where.residentId = parseInt(residentId as string);
    }
    
    if (startDate && endDate) {
      where.startDateTime = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
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
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Update your appointment creation route in server.ts:
app.post('/api/appointments', async (req: any, res: any) => {
  try {
    const { 
      residentId, 
      appointmentTypeId, 
      title, 
      startDateTime, 
      endDateTime,
      isRecurring,
      recurringPattern,
      notes 
    } = req.body;
    
    if (!residentId || !appointmentTypeId || !title || !startDateTime || !endDateTime) {
      return res.status(400).json({ error: 'Resident, appointment type, title, start time, and end time are required' });
    }

    // Function to treat input as Pacific Time and store it properly
    function parsePacificTime(dateString: string): Date {
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
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});
app.put('/api/appointments/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { 
      residentId, 
      appointmentTypeId, 
      title, 
      startDateTime, 
      endDateTime,
      isRecurring,
      recurringPattern,
      notes 
    } = req.body;
    
    if (!residentId || !appointmentTypeId || !title || !startDateTime || !endDateTime) {
      return res.status(400).json({ error: 'Resident, appointment type, title, start time, and end time are required' });
    }

    // Use the SAME function as in your create route
    function parsePacificTime(dateString: string): Date {
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
  } catch (error: any) {
    console.error('Error updating appointment:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Appointment not found' });
    } else {
      res.status(500).json({ error: 'Failed to update appointment' });
    }
  }
});

app.delete('/api/appointments/:id', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    // Soft delete - set isActive to false
    const appointment = await prisma.appointment.update({
      where: { id: parseInt(id) },
      data: { isActive: false }
    });
    
    res.json({ message: 'Appointment deleted successfully', appointment });
  } catch (error: any) {
    console.error('Error deleting appointment:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Appointment not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete appointment' });
    }
  }
});

// 1. First, replace your existing bulk-recurring route with this updated version:
app.post('/api/appointments/bulk-recurring', async (req: any, res: any) => {
  try {
    const { 
      residentId, 
      appointmentTypeId, 
      title, 
      startTime, 
      endTime,
      daysOfWeek, 
      startDate,
      endDate,
      notes 
    } = req.body;
    
    if (!residentId || !appointmentTypeId || !title || !startTime || !endTime || !daysOfWeek || !startDate || !endDate) {
      return res.status(400).json({ error: 'All fields are required for recurring appointments' });
    }

    // Create a unique recurring pattern that includes timestamp for series identification
    const seriesId = `weekly_${daysOfWeek.join('')}_${Date.now()}_${residentId}`;

    function parsePacificTime(dateString: string): Date {
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
  } catch (error: any) {
    console.error('Error creating recurring appointments:', error);
    res.status(500).json({ error: 'Failed to create recurring appointments' });
  }
});

// 2. Then add these two NEW routes:

// Update recurring appointment series
app.put('/api/appointments/recurring-series', async (req: any, res: any) => {
  try {
    const { 
      recurringPattern,
      residentId,
      appointmentTypeId,
      title,
      startTime,
      endTime,
      notes,
      updateFutureOnly = true
    } = req.body;
    
    console.log('=== UPDATE RECURRING SERIES ===');
    console.log('Request body:', req.body);
    
    if (!recurringPattern || !residentId) {
      return res.status(400).json({ error: 'Recurring pattern and resident ID are required' });
    }

    // Find all appointments in this recurring series
    const whereClause: any = {
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

    function parsePacificTime(dateString: string): Date {
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
      
      const updateData: any = {
        startDateTime: newStartDateTime,
        endDateTime: newEndDateTime
      };

      if (appointmentTypeId) updateData.appointmentTypeId = parseInt(appointmentTypeId);
      if (title) updateData.title = title.trim();
      if (notes !== undefined) updateData.notes = notes?.trim() || null;
      
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
  } catch (error: any) {
    console.error('Error updating recurring series:', error);
    res.status(500).json({ error: 'Failed to update recurring series' });
  }
});

// Add this BEFORE your existing DELETE route to check if the route is being hit at all:

app.delete('/api/appointments/recurring-series', async (req: any, res: any) => {
  console.log('🔴 DELETE ROUTE HIT - START');
  console.log('🔴 Request method:', req.method);
  console.log('🔴 Request URL:', req.url);
  console.log('🔴 Request headers:', req.headers);
  console.log('🔴 Request body:', req.body);
  console.log('🔴 Body type:', typeof req.body);
  console.log('🔴 Body keys:', Object.keys(req.body || {}));
  
  try {
    const { recurringPattern, residentId } = req.body;
    
    console.log('🔴 Extracted data:');
    console.log('🔴 - recurringPattern:', recurringPattern);
    console.log('🔴 - residentId:', residentId);
    console.log('🔴 - recurringPattern type:', typeof recurringPattern);
    console.log('🔴 - residentId type:', typeof residentId);
    
    if (!recurringPattern || !residentId) {
      console.log('🔴 VALIDATION FAILED - Missing required fields');
      return res.status(400).json({ 
        error: 'Recurring pattern and resident ID are required',
        received: { recurringPattern, residentId }
      });
    }
    
    console.log('🔴 VALIDATION PASSED - Proceeding with database queries');
    
    // Test database connection first
    console.log('🔴 Testing database connection...');
    const connectionTest = await prisma.appointment.count();
    console.log('🔴 Database connection OK, total appointments:', connectionTest);
    
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
      console.log(`🔴      Recurring: ${apt.isRecurring}, Active: ${apt.isActive}`);
      console.log(`🔴      ResidentId: ${apt.residentId}`);
    });
    
    if (existingAppointments.length === 0) {
      console.log('🔴 NO APPOINTMENTS FOUND - Checking similar patterns...');
      
      // Let's see ALL appointments for this resident to debug pattern matching
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
      });
      
      const response = { 
        message: 'No appointments found with this recurring pattern',
        deletedCount: 0,
        searchedPattern: recurringPattern,
        searchedResidentId: residentId,
        totalAppointmentsForResident: allResidentAppointments.length,
        availablePatterns: allResidentAppointments.map(apt => apt.recurringPattern).filter(Boolean)
      };
      
      console.log('🔴 Sending response:', response);
      return res.json(response);
    }
    
    // Get current time for future filtering
    const now = new Date();
    console.log('🔴 Current time:', now.toISOString());
    
    // Find future appointments
    const futureAppointments = existingAppointments.filter(apt => {
      const aptDate = new Date(apt.startDateTime);
      const isFuture = aptDate >= now;
      console.log(`🔴   Appointment ${apt.id}: ${apt.startDateTime} is future? ${isFuture}`);
      return isFuture;
    });
    
    console.log('🔴 Future appointments to delete:', futureAppointments.length);
    
    if (futureAppointments.length === 0) {
      const response = { 
        message: 'No future appointments found in this recurring series',
        deletedCount: 0,
        totalFound: existingAppointments.length,
        allInPast: true
      };
      console.log('🔴 No future appointments, sending response:', response);
      return res.json(response);
    }
    
    // Perform the deletion
    console.log('🔴 Performing deletion...');
    const deleteResult = await prisma.appointment.updateMany({
      where: {
        residentId: parseInt(residentId),
        recurringPattern: recurringPattern,
        isRecurring: true,
        startDateTime: {
          gte: now
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
          gte: now
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
    
  } catch (error: any) {
    console.error('🔴 ERROR in delete route:', error);
    console.error('🔴 Error message:', error.message);
    console.error('🔴 Error stack:', error.stack);
    
    const errorResponse = { 
      error: 'Failed to delete appointment series',
      details: error.message,
      stack: error.stack 
    };
    
    console.log('🔴 Sending error response:', errorResponse);
    return res.status(500).json(errorResponse);
  }
});


// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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