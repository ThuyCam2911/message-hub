import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1783408627490 implements MigrationInterface {
    name = 'InitialSchema1783408627490'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Required for uuid_generate_v4() below — not guaranteed to exist on a
        // fresh Postgres instance (it happened to already be present on the
        // dev DB this migration was generated against).
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying NOT NULL, CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'operator', 'viewer')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'operator', CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_21a659804ed7bf61eb91688dea" ON "users" ("organization_id") `);
        await queryRunner.query(`CREATE TABLE "channel_strategies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "channel_id" uuid NOT NULL, "strategy_key" character varying NOT NULL, "adapter_name" character varying NOT NULL, "config_encrypted" text, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_0c92c63f6e5a947a18d64e0b2b7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6ef97d17722a0c5ec2a504dce3" ON "channel_strategies" ("channel_id") `);
        await queryRunner.query(`CREATE TYPE "public"."channels_channel_type_enum" AS ENUM('zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock')`);
        await queryRunner.query(`CREATE TABLE "channels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "channel_type" "public"."channels_channel_type_enum" NOT NULL, "name" character varying NOT NULL, "provider" character varying NOT NULL, "config_encrypted" text, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_bc603823f3f741359c2339389f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_dcb0c11359ece13fbbcd745c28" ON "channels" ("organization_id") `);
        await queryRunner.query(`CREATE TYPE "public"."templates_channel_type_enum" AS ENUM('zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock')`);
        await queryRunner.query(`CREATE TABLE "templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "name" character varying NOT NULL, "description" character varying, "channel_type" "public"."templates_channel_type_enum" NOT NULL, "body" jsonb NOT NULL, "variables" jsonb NOT NULL DEFAULT '[]', "version" integer NOT NULL DEFAULT '1', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_515948649ce0bbbe391de702ae5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e1a4d8ae904ce011b0a81a089a" ON "templates" ("organization_id") `);
        await queryRunner.query(`CREATE TYPE "public"."contact_identifiers_channel_type_enum" AS ENUM('zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock')`);
        await queryRunner.query(`CREATE TABLE "contact_identifiers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "contact_id" uuid NOT NULL, "channel_type" "public"."contact_identifiers_channel_type_enum" NOT NULL, "identifier_kind" character varying NOT NULL, "value" character varying NOT NULL, "is_verified" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_2cf37404d73fdb5bf4ca4efabe3" UNIQUE ("contact_id", "channel_type", "identifier_kind"), CONSTRAINT "PK_7d6ba6d61f6a7d6a614f34818f2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_50b32d791124a8f2b161cdc490" ON "contact_identifiers" ("contact_id") `);
        await queryRunner.query(`CREATE TABLE "contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "external_ref" character varying, "display_name" character varying NOT NULL, "attributes" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_b99cd40cfd66a99f1571f4f72e6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0799185e89f0eec8f7ec05a5bb" ON "contacts" ("organization_id") `);
        await queryRunner.query(`CREATE TYPE "public"."failover_policy_steps_advance_on_enum" AS ENUM('provider_error', 'no_confirmation_timeout', 'either')`);
        await queryRunner.query(`CREATE TABLE "failover_policy_steps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "failover_policy_id" uuid NOT NULL, "step_order" integer NOT NULL, "channel_strategy_id" uuid NOT NULL, "timeout_seconds" integer, "advance_on" "public"."failover_policy_steps_advance_on_enum" NOT NULL DEFAULT 'either', CONSTRAINT "UQ_d5417732ebf0ddb09cea913a0d3" UNIQUE ("failover_policy_id", "step_order"), CONSTRAINT "PK_5e32886495d272ba03a6d4e7e45" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_048c9c4beb26a6d5d751e27f9a" ON "failover_policy_steps" ("failover_policy_id") `);
        await queryRunner.query(`CREATE TABLE "failover_policies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "name" character varying NOT NULL, "description" character varying, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_d68d85927e52907d0bc681082f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_be500db269b7a99890ec551ffb" ON "failover_policies" ("organization_id") `);
        await queryRunner.query(`CREATE TYPE "public"."campaigns_status_enum" AS ENUM('draft', 'scheduled', 'running', 'completed')`);
        await queryRunner.query(`CREATE TABLE "campaigns" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "name" character varying NOT NULL, "template_id" uuid NOT NULL, "failover_policy_id" uuid NOT NULL, "status" "public"."campaigns_status_enum" NOT NULL DEFAULT 'draft', "scheduled_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_831e3fcd4fc45b4e4c3f57a9ee4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b82fcefa3141cf82e4eb695b73" ON "campaigns" ("organization_id") `);
        await queryRunner.query(`CREATE TYPE "public"."message_attempts_status_enum" AS ENUM('queued', 'sent', 'delivered', 'undelivered', 'provider_error', 'timed_out', 'superseded')`);
        await queryRunner.query(`CREATE TABLE "message_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "message_request_id" uuid NOT NULL, "failover_policy_step_id" uuid NOT NULL, "channel_strategy_id" uuid NOT NULL, "attempt_number" integer NOT NULL DEFAULT '1', "status" "public"."message_attempts_status_enum" NOT NULL DEFAULT 'queued', "provider_message_id" character varying, "provider_response" jsonb, "error_code" character varying, "error_message" character varying, "sent_at" TIMESTAMP WITH TIME ZONE, "status_updated_at" TIMESTAMP WITH TIME ZONE, "timeout_at" TIMESTAMP WITH TIME ZONE, "timeout_job_id" character varying, CONSTRAINT "PK_32fa8831d7474e6547fb7f87fd4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e4cb7349e56aded8f349666850" ON "message_attempts" ("message_request_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_b6d71befaf91ba8f89802bb39c" ON "message_attempts" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_41c5d18278de62c904bc698a0e" ON "message_attempts" ("provider_message_id") `);
        await queryRunner.query(`CREATE TYPE "public"."message_requests_status_enum" AS ENUM('pending', 'in_progress', 'delivered', 'failed', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "message_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "campaign_id" uuid, "contact_id" uuid NOT NULL, "template_id" uuid NOT NULL, "failover_policy_id" uuid NOT NULL, "template_variables" jsonb NOT NULL DEFAULT '{}', "status" "public"."message_requests_status_enum" NOT NULL DEFAULT 'pending', "current_step_order" integer, "final_channel_strategy_id" uuid, "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_254cdba4327d6e56ba9580b4df6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_53865da52982d9274f57433dfd" ON "message_requests" ("organization_id") `);
        await queryRunner.query(`CREATE TYPE "public"."webhook_events_channel_type_enum" AS ENUM('zbs', 'sms', 'telegram', 'line', 'whatsapp', 'email', 'mock')`);
        await queryRunner.query(`CREATE TABLE "webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "channel_id" character varying, "channel_type" "public"."webhook_events_channel_type_enum" NOT NULL, "raw_payload" jsonb NOT NULL, "signature_valid" boolean NOT NULL DEFAULT false, "matched_attempt_id" uuid, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4cba37e6a0acb5e1fc49c34ebfd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_25f87d230c02d002b06973118d" ON "webhook_events" ("channel_type") `);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" character varying NOT NULL, "actor_user_id" character varying, "action" character varying NOT NULL, "entity_type" character varying NOT NULL, "entity_id" character varying NOT NULL, "diff" jsonb, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_145f35b204c731ba7fc1a0be0e" ON "audit_logs" ("organization_id") `);
        await queryRunner.query(`CREATE TYPE "public"."alerts_severity_enum" AS ENUM('warning', 'critical')`);
        await queryRunner.query(`CREATE TABLE "alerts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" character varying NOT NULL, "channel_strategy_id" uuid NOT NULL, "severity" "public"."alerts_severity_enum" NOT NULL DEFAULT 'warning', "message" character varying NOT NULL, "failure_rate" double precision NOT NULL, "sample_size" integer NOT NULL, "acknowledged_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_60f895662df096bfcdfab7f4b96" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ba66a38e94abfda415d5a9df76" ON "alerts" ("organization_id") `);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_21a659804ed7bf61eb91688dea7" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "channel_strategies" ADD CONSTRAINT "FK_6ef97d17722a0c5ec2a504dce3e" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "channels" ADD CONSTRAINT "FK_dcb0c11359ece13fbbcd745c28b" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "templates" ADD CONSTRAINT "FK_e1a4d8ae904ce011b0a81a089a1" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contact_identifiers" ADD CONSTRAINT "FK_50b32d791124a8f2b161cdc4909" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD CONSTRAINT "FK_0799185e89f0eec8f7ec05a5bb8" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "failover_policy_steps" ADD CONSTRAINT "FK_048c9c4beb26a6d5d751e27f9aa" FOREIGN KEY ("failover_policy_id") REFERENCES "failover_policies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "failover_policy_steps" ADD CONSTRAINT "FK_2c6186b6a1202b75fa95cd36523" FOREIGN KEY ("channel_strategy_id") REFERENCES "channel_strategies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "failover_policies" ADD CONSTRAINT "FK_be500db269b7a99890ec551ffb1" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "campaigns" ADD CONSTRAINT "FK_b82fcefa3141cf82e4eb695b73c" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "campaigns" ADD CONSTRAINT "FK_e7710203c0b031e01de765c25e7" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "campaigns" ADD CONSTRAINT "FK_77597694dd55310dcac0b0a75f7" FOREIGN KEY ("failover_policy_id") REFERENCES "failover_policies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_attempts" ADD CONSTRAINT "FK_e4cb7349e56aded8f349666850d" FOREIGN KEY ("message_request_id") REFERENCES "message_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_attempts" ADD CONSTRAINT "FK_336626a83ea48d6887693b678e9" FOREIGN KEY ("failover_policy_step_id") REFERENCES "failover_policy_steps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_attempts" ADD CONSTRAINT "FK_72d24423871b7ce274f34c71802" FOREIGN KEY ("channel_strategy_id") REFERENCES "channel_strategies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_requests" ADD CONSTRAINT "FK_53865da52982d9274f57433dfdd" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_requests" ADD CONSTRAINT "FK_7aca79380d104b9c25bb6df83c7" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_requests" ADD CONSTRAINT "FK_ff7c94345662aa43119f35ccbe6" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_requests" ADD CONSTRAINT "FK_c637bc1785ad77022e53f17c955" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_requests" ADD CONSTRAINT "FK_8008128daabb9cccfd44fb1e39c" FOREIGN KEY ("failover_policy_id") REFERENCES "failover_policies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "message_requests" ADD CONSTRAINT "FK_aad33a6999ab97e2b9cd4987b4f" FOREIGN KEY ("final_channel_strategy_id") REFERENCES "channel_strategies"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "webhook_events" ADD CONSTRAINT "FK_9333ccdab26ee6cd497f37e5448" FOREIGN KEY ("matched_attempt_id") REFERENCES "message_attempts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "alerts" ADD CONSTRAINT "FK_afc459fe656fd26b1adc1b0980d" FOREIGN KEY ("channel_strategy_id") REFERENCES "channel_strategies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "alerts" DROP CONSTRAINT "FK_afc459fe656fd26b1adc1b0980d"`);
        await queryRunner.query(`ALTER TABLE "webhook_events" DROP CONSTRAINT "FK_9333ccdab26ee6cd497f37e5448"`);
        await queryRunner.query(`ALTER TABLE "message_requests" DROP CONSTRAINT "FK_aad33a6999ab97e2b9cd4987b4f"`);
        await queryRunner.query(`ALTER TABLE "message_requests" DROP CONSTRAINT "FK_8008128daabb9cccfd44fb1e39c"`);
        await queryRunner.query(`ALTER TABLE "message_requests" DROP CONSTRAINT "FK_c637bc1785ad77022e53f17c955"`);
        await queryRunner.query(`ALTER TABLE "message_requests" DROP CONSTRAINT "FK_ff7c94345662aa43119f35ccbe6"`);
        await queryRunner.query(`ALTER TABLE "message_requests" DROP CONSTRAINT "FK_7aca79380d104b9c25bb6df83c7"`);
        await queryRunner.query(`ALTER TABLE "message_requests" DROP CONSTRAINT "FK_53865da52982d9274f57433dfdd"`);
        await queryRunner.query(`ALTER TABLE "message_attempts" DROP CONSTRAINT "FK_72d24423871b7ce274f34c71802"`);
        await queryRunner.query(`ALTER TABLE "message_attempts" DROP CONSTRAINT "FK_336626a83ea48d6887693b678e9"`);
        await queryRunner.query(`ALTER TABLE "message_attempts" DROP CONSTRAINT "FK_e4cb7349e56aded8f349666850d"`);
        await queryRunner.query(`ALTER TABLE "campaigns" DROP CONSTRAINT "FK_77597694dd55310dcac0b0a75f7"`);
        await queryRunner.query(`ALTER TABLE "campaigns" DROP CONSTRAINT "FK_e7710203c0b031e01de765c25e7"`);
        await queryRunner.query(`ALTER TABLE "campaigns" DROP CONSTRAINT "FK_b82fcefa3141cf82e4eb695b73c"`);
        await queryRunner.query(`ALTER TABLE "failover_policies" DROP CONSTRAINT "FK_be500db269b7a99890ec551ffb1"`);
        await queryRunner.query(`ALTER TABLE "failover_policy_steps" DROP CONSTRAINT "FK_2c6186b6a1202b75fa95cd36523"`);
        await queryRunner.query(`ALTER TABLE "failover_policy_steps" DROP CONSTRAINT "FK_048c9c4beb26a6d5d751e27f9aa"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT "FK_0799185e89f0eec8f7ec05a5bb8"`);
        await queryRunner.query(`ALTER TABLE "contact_identifiers" DROP CONSTRAINT "FK_50b32d791124a8f2b161cdc4909"`);
        await queryRunner.query(`ALTER TABLE "templates" DROP CONSTRAINT "FK_e1a4d8ae904ce011b0a81a089a1"`);
        await queryRunner.query(`ALTER TABLE "channels" DROP CONSTRAINT "FK_dcb0c11359ece13fbbcd745c28b"`);
        await queryRunner.query(`ALTER TABLE "channel_strategies" DROP CONSTRAINT "FK_6ef97d17722a0c5ec2a504dce3e"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_21a659804ed7bf61eb91688dea7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ba66a38e94abfda415d5a9df76"`);
        await queryRunner.query(`DROP TABLE "alerts"`);
        await queryRunner.query(`DROP TYPE "public"."alerts_severity_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_145f35b204c731ba7fc1a0be0e"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_25f87d230c02d002b06973118d"`);
        await queryRunner.query(`DROP TABLE "webhook_events"`);
        await queryRunner.query(`DROP TYPE "public"."webhook_events_channel_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_53865da52982d9274f57433dfd"`);
        await queryRunner.query(`DROP TABLE "message_requests"`);
        await queryRunner.query(`DROP TYPE "public"."message_requests_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_41c5d18278de62c904bc698a0e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b6d71befaf91ba8f89802bb39c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e4cb7349e56aded8f349666850"`);
        await queryRunner.query(`DROP TABLE "message_attempts"`);
        await queryRunner.query(`DROP TYPE "public"."message_attempts_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b82fcefa3141cf82e4eb695b73"`);
        await queryRunner.query(`DROP TABLE "campaigns"`);
        await queryRunner.query(`DROP TYPE "public"."campaigns_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_be500db269b7a99890ec551ffb"`);
        await queryRunner.query(`DROP TABLE "failover_policies"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_048c9c4beb26a6d5d751e27f9a"`);
        await queryRunner.query(`DROP TABLE "failover_policy_steps"`);
        await queryRunner.query(`DROP TYPE "public"."failover_policy_steps_advance_on_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0799185e89f0eec8f7ec05a5bb"`);
        await queryRunner.query(`DROP TABLE "contacts"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_50b32d791124a8f2b161cdc490"`);
        await queryRunner.query(`DROP TABLE "contact_identifiers"`);
        await queryRunner.query(`DROP TYPE "public"."contact_identifiers_channel_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e1a4d8ae904ce011b0a81a089a"`);
        await queryRunner.query(`DROP TABLE "templates"`);
        await queryRunner.query(`DROP TYPE "public"."templates_channel_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dcb0c11359ece13fbbcd745c28"`);
        await queryRunner.query(`DROP TABLE "channels"`);
        await queryRunner.query(`DROP TYPE "public"."channels_channel_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6ef97d17722a0c5ec2a504dce3"`);
        await queryRunner.query(`DROP TABLE "channel_strategies"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_21a659804ed7bf61eb91688dea"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
    }

}
