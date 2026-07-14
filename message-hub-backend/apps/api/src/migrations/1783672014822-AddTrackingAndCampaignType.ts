import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTrackingAndCampaignType1783672014822 implements MigrationInterface {
    name = 'AddTrackingAndCampaignType1783672014822'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tracking_events_event_type_enum" AS ENUM('view', 'click')`);
        await queryRunner.query(`CREATE TABLE "tracking_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "message_attempt_id" uuid NOT NULL, "event_type" "public"."tracking_events_event_type_enum" NOT NULL, "url" text, "user_agent" text, "ip_hash" character varying, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cc22ae68e05d9ba5a6575a6f429" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4f59e6eace28b5fc4371870726" ON "tracking_events" ("message_attempt_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e3246a16318c64a2f0c7fa7a18" ON "tracking_events" ("event_type") `);
        await queryRunner.query(`CREATE TYPE "public"."campaigns_campaign_type_enum" AS ENUM('voucher', 'loyalty', 'reward', 'other')`);
        await queryRunner.query(`ALTER TABLE "campaigns" ADD "campaign_type" "public"."campaigns_campaign_type_enum" NOT NULL DEFAULT 'other'`);
        await queryRunner.query(`CREATE INDEX "IDX_8e579a78a9a7bf1414ef5f9624" ON "campaigns" ("campaign_type") `);
        await queryRunner.query(`ALTER TABLE "tracking_events" ADD CONSTRAINT "FK_4f59e6eace28b5fc4371870726e" FOREIGN KEY ("message_attempt_id") REFERENCES "message_attempts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tracking_events" DROP CONSTRAINT "FK_4f59e6eace28b5fc4371870726e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8e579a78a9a7bf1414ef5f9624"`);
        await queryRunner.query(`ALTER TABLE "campaigns" DROP COLUMN "campaign_type"`);
        await queryRunner.query(`DROP TYPE "public"."campaigns_campaign_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e3246a16318c64a2f0c7fa7a18"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4f59e6eace28b5fc4371870726"`);
        await queryRunner.query(`DROP TABLE "tracking_events"`);
        await queryRunner.query(`DROP TYPE "public"."tracking_events_event_type_enum"`);
    }

}
