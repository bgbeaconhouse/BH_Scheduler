// Create this file as: backend/prisma/seed.ts
/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding qualifications...');

  // Kitchen qualifications
  await prisma.qualification.upsert({
    where: { name: 'prep_lead' },
    update: {},
    create: {
      name: 'prep_lead',
      description: 'Experienced kitchen worker qualified to lead the prep team',
      category: 'kitchen'
    }
  });

  await prisma.qualification.upsert({
    where: { name: 'kitchen_helper' },
    update: {},
    create: {
      name: 'kitchen_helper',
      description: 'Weekend kitchen helper - pre-chosen qualification',
      category: 'kitchen'
    }
  });

  // Driving qualifications (hierarchical)
  await prisma.qualification.upsert({
    where: { name: 'driver_shelter_run' },
    update: {},
    create: {
      name: 'driver_shelter_run',
      description: 'Highest level driver - can drive shelter runs, thrift stores, and trash pickup',
      category: 'driving'
    }
  });

  await prisma.qualification.upsert({
    where: { name: 'driver_thrift_store' },
    update: {},
    create: {
      name: 'driver_thrift_store',
      description: 'Mid-level driver - can drive thrift stores and trash pickup',
      category: 'driving'
    }
  });

  await prisma.qualification.upsert({
    where: { name: 'driver_trash_pickup' },
    update: {},
    create: {
      name: 'driver_trash_pickup',
      description: 'Basic driver - can only drive trash pickup routes',
      category: 'driving'
    }
  });

  // Management qualifications
  await prisma.qualification.upsert({
    where: { name: 'thrift_manager_both' },
    update: {},
    create: {
      name: 'thrift_manager_both',
      description: 'Can manage both San Pedro and Long Beach thrift stores',
      category: 'management'
    }
  });

  await prisma.qualification.upsert({
    where: { name: 'thrift_manager_pedro' },
    update: {},
    create: {
      name: 'thrift_manager_pedro',
      description: 'Can manage San Pedro thrift store only',
      category: 'management'
    }
  });

  await prisma.qualification.upsert({
    where: { name: 'thrift_manager_long_beach' },
    update: {},
    create: {
      name: 'thrift_manager_long_beach',
      description: 'Can manage Long Beach thrift store only',
      category: 'management'
    }
  });

  console.log('Qualifications seeded successfully!');
  await seedDepartmentsAndShifts();
  await seedAppointmentTypes();
}

async function seedDepartmentsAndShifts() {
  console.log('Seeding departments...');

  // Create departments with priority levels
  const kitchenDept = await prisma.department.upsert({
    where: { name: 'kitchen' },
    update: {},
    create: {
      name: 'kitchen',
      description: 'Kitchen operations including prep, dishwashing, and cleaning',
      priority: 100 // Highest priority
    }
  });

  const shelterRunsDept = await prisma.department.upsert({
    where: { name: 'shelter_runs' },
    update: {},
    create: {
      name: 'shelter_runs',
      description: 'Transportation services to shelters',
      priority: 90
    }
  });

  const thriftStoresDept = await prisma.department.upsert({
    where: { name: 'thrift_stores' },
    update: {},
    create: {
      name: 'thrift_stores',
      description: 'San Pedro and Long Beach thrift store operations',
      priority: 80
    }
  });

  const maintenanceDept = await prisma.department.upsert({
    where: { name: 'maintenance' },
    update: {},
    create: {
      name: 'maintenance',
      description: 'Facility maintenance including trash pickup and donations',
      priority: 70
    }
  });

  console.log('Seeding shifts...');

  // Get qualification IDs
  const prepLead = await prisma.qualification.findUnique({ where: { name: 'prep_lead' } });
  const kitchenHelper = await prisma.qualification.findUnique({ where: { name: 'kitchen_helper' } });
  const driverShelter = await prisma.qualification.findUnique({ where: { name: 'driver_shelter_run' } });
  const driverThrift = await prisma.qualification.findUnique({ where: { name: 'driver_thrift_store' } });
  const driverTrash = await prisma.qualification.findUnique({ where: { name: 'driver_trash_pickup' } });
  const managerBoth = await prisma.qualification.findUnique({ where: { name: 'thrift_manager_both' } });
  const managerPedro = await prisma.qualification.findUnique({ where: { name: 'thrift_manager_pedro' } });
  const managerLongBeach = await prisma.qualification.findUnique({ where: { name: 'thrift_manager_long_beach' } });

  // Kitchen Shifts
  await prisma.shift.upsert({
    where: { id: 1 },
    update: {},
    create: {
      departmentId: kitchenDept.id,
      name: 'Prep Team',
      description: 'Kitchen preparation team with lead supervision',
      startTime: '08:30',
      endTime: '16:00',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: true,
      roles: {
        create: [
          {
            qualificationId: prepLead?.id,
            roleTitle: 'prep_lead',
            requiredCount: 1
          },
          {
            qualificationId: null,
            roleTitle: 'prep_worker',
            requiredCount: 2
          }
        ]
      }
    }
  });

  await prisma.shift.upsert({
    where: { id: 2 },
    update: {},
    create: {
      departmentId: kitchenDept.id,
      name: 'Morning Dishwasher',
      description: 'Morning dishwashing shift',
      startTime: '05:00',
      endTime: '12:30',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: true,
      roles: {
        create: [
          {
            qualificationId: null,
            roleTitle: 'dishwasher',
            requiredCount: 1
          }
        ]
      }
    }
  });

  await prisma.shift.upsert({
    where: { id: 3 },
    update: {},
    create: {
      departmentId: kitchenDept.id,
      name: 'Evening Dishwasher',
      description: 'Evening dishwashing shift',
      startTime: '12:00',
      endTime: '19:30',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: true,
      roles: {
        create: [
          {
            qualificationId: null,
            roleTitle: 'dishwasher',
            requiredCount: 1
          }
        ]
      }
    }
  });

  await prisma.shift.upsert({
    where: { id: 4 },
    update: {},
    create: {
      departmentId: kitchenDept.id,
      name: 'Janitor Crew',
      description: 'Evening cleaning crew',
      startTime: '17:30',
      endTime: '19:30',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: false,
      roles: {
        create: [
          {
            qualificationId: null,
            roleTitle: 'janitor',
            requiredCount: 3
          }
        ]
      }
    }
  });

  await prisma.shift.upsert({
    where: { id: 5 },
    update: {},
    create: {
      departmentId: kitchenDept.id,
      name: 'Kitchen Helper',
      description: 'Weekend kitchen helper (pre-chosen)',
      startTime: '07:00',
      endTime: '15:00',
      monday: false,
      tuesday: false,
      wednesday: false,
      thursday: false,
      friday: false,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: true,
      roles: {
        create: [
          {
            qualificationId: kitchenHelper?.id,
            roleTitle: 'kitchen_helper',
            requiredCount: 1
          }
        ]
      }
    }
  });

  // Shelter Runs
  await prisma.shift.upsert({
    where: { id: 6 },
    update: {},
    create: {
      departmentId: shelterRunsDept.id,
      name: 'Shelter Run Morning',
      description: 'Morning shelter transportation',
      startTime: '06:30',
      endTime: '09:00',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: false,
      roles: {
        create: [
          {
            qualificationId: driverShelter?.id,
            roleTitle: 'driver',
            requiredCount: 2
          },
          {
            qualificationId: null,
            roleTitle: 'assistant',
            requiredCount: 2
          }
        ]
      }
    }
  });

  await prisma.shift.upsert({
    where: { id: 7 },
    update: {},
    create: {
      departmentId: shelterRunsDept.id,
      name: 'Shelter Run Midday',
      description: 'Midday shelter transportation',
      startTime: '11:00',
      endTime: '13:30',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: false,
      roles: {
        create: [
          {
            qualificationId: driverShelter?.id,
            roleTitle: 'driver',
            requiredCount: 2
          },
          {
            qualificationId: null,
            roleTitle: 'assistant',
            requiredCount: 2
          }
        ]
      }
    }
  });

  await prisma.shift.upsert({
    where: { id: 8 },
    update: {},
    create: {
      departmentId: shelterRunsDept.id,
      name: 'Shelter Run Evening',
      description: 'Evening shelter transportation',
      startTime: '16:00',
      endTime: '18:30',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: false,
      roles: {
        create: [
          {
            qualificationId: driverShelter?.id,
            roleTitle: 'driver',
            requiredCount: 2
          },
          {
            qualificationId: null,
            roleTitle: 'assistant',
            requiredCount: 2
          }
        ]
      }
    }
  });

  // Thrift Stores
  await prisma.shift.upsert({
    where: { id: 9 },
    update: {},
    create: {
      departmentId: thriftStoresDept.id,
      name: 'San Pedro Thrift Store',
      description: 'San Pedro store operations',
      startTime: '10:00',
      endTime: '19:45',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 6, // 6+ months required
      blocksAllAppointments: false,
      blocksCounselingOnly: true, // Blocks counseling
      allowsTemporaryLeave: true, // Allows doctor appointments
      roles: {
        create: [
          {
            qualificationId: managerPedro?.id || managerBoth?.id,
            roleTitle: 'manager',
            requiredCount: 1
          },
          {
            qualificationId: null,
            roleTitle: 'worker',
            requiredCount: 3
          }
        ]
      }
    }
  });

  await prisma.shift.upsert({
    where: { id: 10 },
    update: {},
    create: {
      departmentId: thriftStoresDept.id,
      name: 'Long Beach Thrift Store',
      description: 'Long Beach store operations',
      startTime: '09:30',
      endTime: '20:00',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 6, // 6+ months required
      blocksAllAppointments: false,
      blocksCounselingOnly: true, // Blocks counseling
      allowsTemporaryLeave: true, // Allows doctor appointments
      roles: {
        create: [
          {
            qualificationId: managerLongBeach?.id || managerBoth?.id,
            roleTitle: 'manager',
            requiredCount: 1
          },
          {
            qualificationId: driverThrift?.id || driverShelter?.id,
            roleTitle: 'driver',
            requiredCount: 1
          },
          {
            qualificationId: null,
            roleTitle: 'worker',
            requiredCount: 4
          }
        ]
      }
    }
  });

  // Maintenance
  await prisma.shift.upsert({
    where: { id: 11 },
    update: {},
    create: {
      departmentId: maintenanceDept.id,
      name: 'Trash Pickup',
      description: 'Daily trash pickup service',
      startTime: '17:45',
      endTime: '20:00',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: false,
      allowsTemporaryLeave: false,
      roles: {
        create: [
          {
            qualificationId: driverTrash?.id || driverThrift?.id || driverShelter?.id,
            roleTitle: 'driver',
            requiredCount: 1
          }
        ]
      }
    }
  });

  await prisma.shift.upsert({
    where: { id: 12 },
    update: {},
    create: {
      departmentId: maintenanceDept.id,
      name: 'Donation Pickup (Mon-Wed)',
      description: 'Donation pickup service Monday through Wednesday',
      startTime: '08:00',
      endTime: '17:00',
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: false,
      friday: false,
      saturday: false,
      sunday: false,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: true, // Long shift blocks counseling
      allowsTemporaryLeave: true,
      roles: {
        create: [
          {
            qualificationId: null,
            roleTitle: 'assistant',
            requiredCount: 2
          }
        ]
      }
    }
  });

  await prisma.shift.upsert({
    where: { id: 13 },
    update: {},
    create: {
      departmentId: maintenanceDept.id,
      name: 'Donation Pickup (Thu-Sun)',
      description: 'Donation pickup service Thursday through Sunday',
      startTime: '08:00',
      endTime: '17:00',
      monday: false,
      tuesday: false,
      wednesday: false,
      thursday: true,
      friday: true,
      saturday: true,
      sunday: true,
      minTenureMonths: 0,
      blocksAllAppointments: false,
      blocksCounselingOnly: true, // Long shift blocks counseling
      allowsTemporaryLeave: true,
      roles: {
        create: [
          {
            qualificationId: null,
            roleTitle: 'assistant',
            requiredCount: 1
          }
        ]
      }
    }
  });

  console.log('Departments and shifts seeded successfully!');
}

async function seedAppointmentTypes() {
  console.log('Seeding appointment types...');

  await prisma.appointmentType.upsert({
    where: { name: 'counseling' },
    update: {},
    create: {
      name: 'counseling',
      description: 'Individual or group counseling sessions',
      priority: 100 // High priority - blocks thrift store work
    }
  });

  await prisma.appointmentType.upsert({
    where: { name: 'medical' },
    update: {},
    create: {
      name: 'medical',
      description: 'Doctor appointments, medical checkups, procedures',
      priority: 90 // High priority - allows temporary leave
    }
  });

  await prisma.appointmentType.upsert({
    where: { name: 'court' },
    update: {},
    create: {
      name: 'court',
      description: 'Court appearances, legal meetings',
      priority: 95 // Very high priority
    }
  });

  await prisma.appointmentType.upsert({
    where: { name: 'family_visit' },
    update: {},
    create: {
      name: 'family_visit',
      description: 'Family visits and meetings',
      priority: 70 // Medium priority
    }
  });

  await prisma.appointmentType.upsert({
    where: { name: 'therapy' },
    update: {},
    create: {
      name: 'therapy',
      description: 'Specialized therapy sessions (group therapy, etc.)',
      priority: 85 // High priority
    }
  });

  await prisma.appointmentType.upsert({
    where: { name: 'education' },
    update: {},
    create: {
      name: 'education',
      description: 'Educational classes, training sessions',
      priority: 60 // Medium priority
    }
  });

  console.log('Appointment types seeded successfully!');
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });