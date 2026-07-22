-- Pet Shelter schema
-- Run this against your existing c237_030_ca2team3 database
-- (e.g. right-click it in MySQL Workbench > Set as Default Schema, then run this script)

USE c237_030_ca2team3;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('user','admin') NOT NULL DEFAULT 'user',
    phone VARCHAR(40),
    address VARCHAR(255),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    species ENUM('Dog','Cat','Rabbit','Bird','Other') NOT NULL,
    breed VARCHAR(120) NOT NULL,
    ageMonths INT NOT NULL,
    ageGroup ENUM('Baby','Young','Adult','Senior') NOT NULL,
    gender ENUM('Female','Male','Unknown') NOT NULL,
    weightLbs DECIMAL(7,2) NOT NULL,
    personality TEXT NOT NULL,
    description TEXT NOT NULL,
    medicalHistory TEXT,
    vaccinationStatus VARCHAR(120),
    rescueDate DATE,
    shelterLocation VARCHAR(160),
    kennelCode VARCHAR(40),
    adoptionStatus ENUM('Available','Pending','Adopted','Medical Hold','Archived') NOT NULL DEFAULT 'Available',
    friendlyWithPeople TINYINT(1) NOT NULL DEFAULT 0,
    friendlyWithKids TINYINT(1) NOT NULL DEFAULT 0,
    friendlyWithDogs TINYINT(1) NOT NULL DEFAULT 0,
    friendlyWithCats TINYINT(1) NOT NULL DEFAULT 0,
    friendlyWithOtherPets TINYINT(1) NOT NULL DEFAULT 0,
    specialNeeds TINYINT(1) NOT NULL DEFAULT 0,
    healthy TINYINT(1) NOT NULL DEFAULT 1,
    image VARCHAR(255),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    petId INT NOT NULL,
    userId INT NOT NULL,
    stage ENUM('Submitted','Under Review','Interview Scheduled','Home Visit','Approved','Rejected','Completed') NOT NULL DEFAULT 'Submitted',
    livingSpace VARCHAR(120) NOT NULL,
    workingHours VARCHAR(120) NOT NULL,
    familyMembers INT NOT NULL,
    hasChildren TINYINT(1) NOT NULL DEFAULT 0,
    existingPets VARCHAR(255) DEFAULT 'None',
    activityLevel VARCHAR(80) NOT NULL,
    experience TEXT,
    motivation TEXT,
    decisionNotes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (petId) REFERENCES pets(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE favourites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    petId INT NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_pet (userId, petId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (petId) REFERENCES pets(id) ON DELETE CASCADE
);

-- Enhancement: in-app notifications, e.g. "your application was Approved"
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    message VARCHAR(255) NOT NULL,
    isRead TINYINT(1) NOT NULL DEFAULT 0,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Sample admin account (password: admin123)
INSERT INTO users (username, email, password, role, phone, address)
VALUES ('admin', 'admin@petshelter.com', SHA1('admin123'), 'admin', '91234567', 'Shelter HQ');

-- Sample pets
INSERT INTO pets (name, species, breed, ageMonths, ageGroup, gender, weightLbs, personality, description, medicalHistory, vaccinationStatus, rescueDate, shelterLocation, kennelCode, adoptionStatus, friendlyWithKids, friendlyWithDogs, friendlyWithCats, friendlyWithOtherPets, specialNeeds, healthy, image)
VALUES
('Buddy', 'Dog', 'Golden Retriever', 24, 'Adult', 'Male', 65.50, 'Playful and affectionate, loves fetch', 'Buddy was rescued from a busy street and is now looking for a loving home.', 'No known conditions', 'Fully Vaccinated', '2026-01-15', 'Main Shelter', 'K-101', 'Available', 1, 1, 0, 1, 0, 1, NULL),
('Whiskers', 'Cat', 'Domestic Shorthair', 12, 'Young', 'Female', 8.20, 'Independent but affectionate once comfortable', 'Whiskers is a calm cat who enjoys sunny windowsills.', 'No known conditions', 'Fully Vaccinated', '2026-03-02', 'Main Shelter', 'K-102', 'Available', 1, 0, 1, 0, 0, 1, NULL);
