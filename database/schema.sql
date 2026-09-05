-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 23, 2026 at 08:12 PM
-- Server version: 10.4.24-MariaDB
-- PHP Version: 8.1.6

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `techbridge_ai`
--

-- --------------------------------------------------------

--
-- Table structure for table `ai_conversations`
--

CREATE TABLE `ai_conversations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `file_id` bigint(20) UNSIGNED DEFAULT NULL,
  `conversation_type` enum('file','project','diagnosis','architecture','security','general') COLLATE utf8mb4_unicode_ci DEFAULT 'project',
  `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ai_messages`
--

CREATE TABLE `ai_messages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `conversation_id` bigint(20) UNSIGNED NOT NULL,
  `role` enum('system','user','assistant','tool') COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `analysis_issues`
--

CREATE TABLE `analysis_issues` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `file_id` bigint(20) UNSIGNED DEFAULT NULL,
  `issue_type` enum('syntax','runtime','logic','database','dependency','security','architecture','performance','configuration','compatibility','style','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `severity` enum('critical','high','medium','low','info') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `root_cause` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `suggested_fix` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detection_source` enum('static_analysis','ai_analysis','runtime_validation','build_validation','dependency_analysis','security_analysis','user_report') COLLATE utf8mb4_unicode_ci DEFAULT 'ai_analysis',
  `confidence` decimal(5,2) DEFAULT NULL,
  `status` enum('open','in_progress','fixed','ignored','verified') COLLATE utf8mb4_unicode_ci DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `analysis_runs`
--

CREATE TABLE `analysis_runs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `run_type` enum('initial','incremental','post_change','security','dependency','runtime','build','full') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('queued','running','completed','failed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'queued',
  `progress` decimal(5,2) DEFAULT 0.00,
  `files_analyzed` int(10) UNSIGNED DEFAULT 0,
  `issues_found` int(10) UNSIGNED DEFAULT 0,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `api_endpoints`
--

CREATE TABLE `api_endpoints` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `file_id` bigint(20) UNSIGNED DEFAULT NULL,
  `method` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `route` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `controller_name` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `framework` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `authentication_required` tinyint(1) DEFAULT 0,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_changes`
--

CREATE TABLE `code_changes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `file_id` bigint(20) UNSIGNED NOT NULL,
  `conversation_id` bigint(20) UNSIGNED DEFAULT NULL,
  `issue_id` bigint(20) UNSIGNED DEFAULT NULL,
  `change_type` enum('ai_fix','ai_modification','manual','rollback') COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_content` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_content` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `diff_content` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('proposed','applied','rejected','rolled_back') COLLATE utf8mb4_unicode_ci DEFAULT 'proposed',
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_relationships`
--

CREATE TABLE `code_relationships` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `source_file_id` bigint(20) UNSIGNED NOT NULL,
  `target_file_id` bigint(20) UNSIGNED DEFAULT NULL,
  `relationship_type` enum('imports','exports','calls','extends','implements','references','uses','api_request','database_query','unknown') COLLATE utf8mb4_unicode_ci NOT NULL,
  `symbol_name` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `database_entities`
--

CREATE TABLE `database_entities` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `file_id` bigint(20) UNSIGNED DEFAULT NULL,
  `entity_type` enum('table','view','collection','model','query','procedure','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `database_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `issue_relationships`
--

CREATE TABLE `issue_relationships` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `source_issue_id` bigint(20) UNSIGNED NOT NULL,
  `target_issue_id` bigint(20) UNSIGNED NOT NULL,
  `relationship_type` enum('causes','caused_by','related','blocks','depends_on') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `projects`
--

CREATE TABLE `projects` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_filename` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storage_path` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extracted_path` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `working_path` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `primary_language` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `framework` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_files` int(10) UNSIGNED DEFAULT 0,
  `total_lines` bigint(20) UNSIGNED DEFAULT 0,
  `total_size_bytes` bigint(20) UNSIGNED DEFAULT 0,
  `health_score` decimal(5,2) DEFAULT 0.00,
  `status` enum('uploaded','extracting','indexing','analyzing','ready','error','archived') COLLATE utf8mb4_unicode_ci DEFAULT 'uploaded',
  `analysis_progress` decimal(5,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `project_configurations`
--

CREATE TABLE `project_configurations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `file_id` bigint(20) UNSIGNED DEFAULT NULL,
  `variable_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `variable_type` enum('environment','configuration','secret_reference','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `is_sensitive` tinyint(1) DEFAULT 0,
  `detected_value` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('detected','missing','warning','safe') COLLATE utf8mb4_unicode_ci DEFAULT 'detected',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `project_dependencies`
--

CREATE TABLE `project_dependencies` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dependency_type` enum('runtime','development','peer','optional','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `package_manager` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_file_id` bigint(20) UNSIGNED DEFAULT NULL,
  `is_outdated` tinyint(1) DEFAULT 0,
  `security_status` enum('safe','warning','vulnerable','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `project_exports`
--

CREATE TABLE `project_exports` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `version_id` bigint(20) UNSIGNED DEFAULT NULL,
  `filename` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `storage_path` varchar(2000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size_bytes` bigint(20) UNSIGNED DEFAULT NULL,
  `status` enum('creating','ready','failed','expired') COLLATE utf8mb4_unicode_ci DEFAULT 'creating',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `expires_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `project_files`
--

CREATE TABLE `project_files` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `parent_file_id` bigint(20) UNSIGNED DEFAULT NULL,
  `path` varchar(2000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `extension` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_type` enum('file','directory') COLLATE utf8mb4_unicode_ci DEFAULT 'file',
  `language` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `size_bytes` bigint(20) UNSIGNED DEFAULT 0,
  `line_count` int(10) UNSIGNED DEFAULT 0,
  `content_hash` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storage_path` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_generated` tinyint(1) DEFAULT 0,
  `is_ignored` tinyint(1) DEFAULT 0,
  `is_binary` tinyint(1) DEFAULT 0,
  `health_status` enum('healthy','warning','critical','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `health_score` decimal(5,2) DEFAULT 0.00,
  `analysis_status` enum('pending','processing','completed','failed','skipped') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `project_versions`
--

CREATE TABLE `project_versions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `version_number` int(10) UNSIGNED NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `snapshot_path` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `security_findings`
--

CREATE TABLE `security_findings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `file_id` bigint(20) UNSIGNED DEFAULT NULL,
  `issue_id` bigint(20) UNSIGNED DEFAULT NULL,
  `category` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('critical','high','medium','low','info') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `evidence` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recommendation` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('open','fixed','ignored','verified') COLLATE utf8mb4_unicode_ci DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `full_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `avatar_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('user','admin') COLLATE utf8mb4_unicode_ci DEFAULT 'user',
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `validation_runs`
--

CREATE TABLE `validation_runs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `project_id` bigint(20) UNSIGNED NOT NULL,
  `type` enum('build','test','runtime','lint','dependency','full') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('queued','running','passed','failed','error') COLLATE utf8mb4_unicode_ci DEFAULT 'queued',
  `command` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `output` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_output` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exit_code` int(11) DEFAULT NULL,
  `duration_ms` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `ai_conversations`
--
ALTER TABLE `ai_conversations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `file_id` (`file_id`);

--
-- Indexes for table `ai_messages`
--
ALTER TABLE `ai_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `conversation_id` (`conversation_id`);

--
-- Indexes for table `analysis_issues`
--
ALTER TABLE `analysis_issues`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `file_id` (`file_id`);

--
-- Indexes for table `analysis_runs`
--
ALTER TABLE `analysis_runs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`);

--
-- Indexes for table `api_endpoints`
--
ALTER TABLE `api_endpoints`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `file_id` (`file_id`);

--
-- Indexes for table `code_changes`
--
ALTER TABLE `code_changes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `file_id` (`file_id`),
  ADD KEY `conversation_id` (`conversation_id`),
  ADD KEY `issue_id` (`issue_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `code_relationships`
--
ALTER TABLE `code_relationships`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `source_file_id` (`source_file_id`),
  ADD KEY `target_file_id` (`target_file_id`);

--
-- Indexes for table `database_entities`
--
ALTER TABLE `database_entities`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `file_id` (`file_id`);

--
-- Indexes for table `issue_relationships`
--
ALTER TABLE `issue_relationships`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `source_issue_id` (`source_issue_id`),
  ADD KEY `target_issue_id` (`target_issue_id`);

--
-- Indexes for table `projects`
--
ALTER TABLE `projects`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `project_configurations`
--
ALTER TABLE `project_configurations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `file_id` (`file_id`);

--
-- Indexes for table `project_dependencies`
--
ALTER TABLE `project_dependencies`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `source_file_id` (`source_file_id`);

--
-- Indexes for table `project_exports`
--
ALTER TABLE `project_exports`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `version_id` (`version_id`);

--
-- Indexes for table `project_files`
--
ALTER TABLE `project_files`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `parent_file_id` (`parent_file_id`);

--
-- Indexes for table `project_versions`
--
ALTER TABLE `project_versions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `project_id` (`project_id`,`version_number`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `security_findings`
--
ALTER TABLE `security_findings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`),
  ADD KEY `file_id` (`file_id`),
  ADD KEY `issue_id` (`issue_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `validation_runs`
--
ALTER TABLE `validation_runs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `project_id` (`project_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `ai_conversations`
--
ALTER TABLE `ai_conversations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ai_messages`
--
ALTER TABLE `ai_messages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `analysis_issues`
--
ALTER TABLE `analysis_issues`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `analysis_runs`
--
ALTER TABLE `analysis_runs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `api_endpoints`
--
ALTER TABLE `api_endpoints`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_changes`
--
ALTER TABLE `code_changes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_relationships`
--
ALTER TABLE `code_relationships`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `database_entities`
--
ALTER TABLE `database_entities`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `issue_relationships`
--
ALTER TABLE `issue_relationships`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `projects`
--
ALTER TABLE `projects`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `project_configurations`
--
ALTER TABLE `project_configurations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `project_dependencies`
--
ALTER TABLE `project_dependencies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `project_exports`
--
ALTER TABLE `project_exports`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `project_files`
--
ALTER TABLE `project_files`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `project_versions`
--
ALTER TABLE `project_versions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `security_findings`
--
ALTER TABLE `security_findings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `validation_runs`
--
ALTER TABLE `validation_runs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `ai_conversations`
--
ALTER TABLE `ai_conversations`
  ADD CONSTRAINT `ai_conversations_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `ai_conversations_ibfk_2` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `ai_conversations_ibfk_3` FOREIGN KEY (`file_id`) REFERENCES `project_files` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `ai_messages`
--
ALTER TABLE `ai_messages`
  ADD CONSTRAINT `ai_messages_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `analysis_issues`
--
ALTER TABLE `analysis_issues`
  ADD CONSTRAINT `analysis_issues_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `analysis_issues_ibfk_2` FOREIGN KEY (`file_id`) REFERENCES `project_files` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `analysis_runs`
--
ALTER TABLE `analysis_runs`
  ADD CONSTRAINT `analysis_runs_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `api_endpoints`
--
ALTER TABLE `api_endpoints`
  ADD CONSTRAINT `api_endpoints_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `api_endpoints_ibfk_2` FOREIGN KEY (`file_id`) REFERENCES `project_files` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `code_changes`
--
ALTER TABLE `code_changes`
  ADD CONSTRAINT `code_changes_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `code_changes_ibfk_2` FOREIGN KEY (`file_id`) REFERENCES `project_files` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `code_changes_ibfk_3` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `code_changes_ibfk_4` FOREIGN KEY (`issue_id`) REFERENCES `analysis_issues` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `code_changes_ibfk_5` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `code_relationships`
--
ALTER TABLE `code_relationships`
  ADD CONSTRAINT `code_relationships_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `code_relationships_ibfk_2` FOREIGN KEY (`source_file_id`) REFERENCES `project_files` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `code_relationships_ibfk_3` FOREIGN KEY (`target_file_id`) REFERENCES `project_files` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `database_entities`
--
ALTER TABLE `database_entities`
  ADD CONSTRAINT `database_entities_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `database_entities_ibfk_2` FOREIGN KEY (`file_id`) REFERENCES `project_files` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `issue_relationships`
--
ALTER TABLE `issue_relationships`
  ADD CONSTRAINT `issue_relationships_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `issue_relationships_ibfk_2` FOREIGN KEY (`source_issue_id`) REFERENCES `analysis_issues` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `issue_relationships_ibfk_3` FOREIGN KEY (`target_issue_id`) REFERENCES `analysis_issues` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `projects`
--
ALTER TABLE `projects`
  ADD CONSTRAINT `projects_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `project_configurations`
--
ALTER TABLE `project_configurations`
  ADD CONSTRAINT `project_configurations_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `project_configurations_ibfk_2` FOREIGN KEY (`file_id`) REFERENCES `project_files` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `project_dependencies`
--
ALTER TABLE `project_dependencies`
  ADD CONSTRAINT `project_dependencies_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `project_dependencies_ibfk_2` FOREIGN KEY (`source_file_id`) REFERENCES `project_files` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `project_exports`
--
ALTER TABLE `project_exports`
  ADD CONSTRAINT `project_exports_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `project_exports_ibfk_2` FOREIGN KEY (`version_id`) REFERENCES `project_versions` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `project_files`
--
ALTER TABLE `project_files`
  ADD CONSTRAINT `project_files_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `project_files_ibfk_2` FOREIGN KEY (`parent_file_id`) REFERENCES `project_files` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `project_versions`
--
ALTER TABLE `project_versions`
  ADD CONSTRAINT `project_versions_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `project_versions_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `security_findings`
--
ALTER TABLE `security_findings`
  ADD CONSTRAINT `security_findings_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `security_findings_ibfk_2` FOREIGN KEY (`file_id`) REFERENCES `project_files` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `security_findings_ibfk_3` FOREIGN KEY (`issue_id`) REFERENCES `analysis_issues` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `validation_runs`
--
ALTER TABLE `validation_runs`
  ADD CONSTRAINT `validation_runs_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
