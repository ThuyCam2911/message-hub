import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTemplateApprovalFields1783476764845 implements MigrationInterface {
    name = 'AddTemplateApprovalFields1783476764845'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "templates" ADD "source_channel_id" uuid`);
        await queryRunner.query(`ALTER TABLE "templates" ADD "provider_template_id" character varying`);
        await queryRunner.query(`CREATE TYPE "public"."templates_approval_status_enum" AS ENUM('not_required', 'pending', 'approved', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "templates" ADD "approval_status" "public"."templates_approval_status_enum" NOT NULL DEFAULT 'not_required'`);
        await queryRunner.query(`ALTER TABLE "templates" ADD "approval_detail" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN "approval_detail"`);
        await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN "approval_status"`);
        await queryRunner.query(`DROP TYPE "public"."templates_approval_status_enum"`);
        await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN "provider_template_id"`);
        await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN "source_channel_id"`);
    }

}
