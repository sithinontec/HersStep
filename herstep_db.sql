-- MySQL schema for HersStep
-- Run: mysql -u <user> -p < hersstep_db < create_tables_mysql.sql

CREATE DATABASE IF NOT EXISTS herstep_db;
USE herstep_db;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  age INT,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'customer',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Products
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  model VARCHAR(150) NOT NULL,
  color VARCHAR(100),
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  image TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(100) UNIQUE NOT NULL,
  user_id INT,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'placed',
  shipping_address JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT,
  product_id INT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Seed some initial data (optional)
INSERT IGNORE INTO products (name, model, color, description, price, stock, image)
VALUES
  ('Sporty Runner','Sneakers','White/Blue','Lightweight running shoes',79.99,30,'https://placehold.co/300X200'),
  ('Pro Trainer','Sneakers','Black/Red','High-performance trainers',99.99,20,'https://placehold.co/300X200'),
  ('Court Classic','Court','White','Classic court sneakers',89.99,15,'https://placehold.co/300X200');


INSERT INTO users (first_name, last_name, email, password, role)
VALUES 
    ('Staff','User','staff@hersstep.com','staff123','staff'),
    ('Customer','User','customer@hersstep.com','customer123','customer')
ON DUPLICATE KEY UPDATE email = email;

