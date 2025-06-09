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