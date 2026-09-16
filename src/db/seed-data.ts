import type { Kysely } from 'kysely';

import type { Database } from './types.js';

export const seedIds = {
  isiZuluTool: '11111111-1111-4111-8111-111111111111',
  brokenTool: '22222222-2222-4222-8222-222222222222',
  consentStep: '31111111-1111-4111-8111-111111111111',
  contextStep: '32222222-2222-4222-8222-222222222222',
  readingStep: '33333333-3333-4333-8333-333333333333',
  brokenEmptyStep: '34444444-4444-4444-8444-444444444444',
  brokenReadingStep: '35555555-5555-4555-8555-555555555555',
  brokenChoiceStep: '36666666-6666-4666-8666-666666666666',
} as const;

export const seedIsiZuluPassage =
  'ULindiwe uvuka ekuseni kakhulu ngoba ufuna ukusiza ugogo wakhe engadini. Ugeza ubuso, agqoke izingubo zesikole, bese edla iphalishi elishisayo. Ngaphambi kokuhamba, uthatha ibhakede ayokha amanzi empompini oseduze. Endleleni uhlangana nomngane wakhe uSipho, naye ophethe izincwadi. Bayabingelelana bahambe ndawonye beya esikoleni. Lapho befika, uthisha ubamukela ngokumamatheka futhi abacele bavule izincwadi zabo. Namuhla bafunda ngenyoni encane eyakha isidleke esihlahleni esikhulu. ULindiwe uyayithanda indaba ngoba imfundisa ukubekezela nokusebenza kanzima. Ngesikhathi sekhefu, yena noSipho babelana ngesinkwa nesithelo ngaphansi komthunzi. Ngemva kwezifundo, babuyela ekhaya behleka, bekhuluma ngezinto ezintsha abazifundile, futhi bethembisa ukuphinda bafunde indaba kusihlwa. Ekhaya, ugogo ulalele ngenjabulo lapho ULindiwe exoxa ngenyoni. Bafunda ndawonye kancane, balungise amagama anzima, bese behlela umsebenzi wangakusasa ngaphambi kokuba kushone ilanga. ULindiwe ubonga ugogo, abeke izincwadi zakhe etafuleni, aphuze amanzi, bese eqala umsebenzi wakhe wesikole ngokuzimisela okukhulu njalo kusihlwa.';

export async function seedDatabase(database: Kysely<Database>): Promise<void> {
  await database.transaction().execute(async (transaction) => {
    await transaction
      .insertInto('assessment_tools')
      .values({
        id: seedIds.isiZuluTool,
        title: 'Grade 3 Oral Reading Fluency',
        grade: '3',
        language: 'isiZulu',
        benchmark_value: '35',
        benchmark_unit: 'words/min',
        draft_revision: 1,
        archived_at: null,
      })
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet({
          title: 'Grade 3 Oral Reading Fluency',
          grade: '3',
          language: 'isiZulu',
          benchmark_value: '35',
          benchmark_unit: 'words/min',
          draft_revision: 1,
          archived_at: null,
          updated_at: new Date(),
        }),
      )
      .execute();

    await transaction
      .insertInto('assessment_tools')
      .values({
        id: seedIds.brokenTool,
        title: 'Deliberately Broken Assessment',
        grade: '3',
        language: null,
        benchmark_value: null,
        benchmark_unit: null,
        draft_revision: 1,
        archived_at: null,
      })
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet({
          title: 'Deliberately Broken Assessment',
          grade: '3',
          language: null,
          benchmark_value: null,
          benchmark_unit: null,
          draft_revision: 1,
          archived_at: null,
          updated_at: new Date(),
        }),
      )
      .execute();

    await transaction
      .deleteFrom('steps')
      .where('tool_id', 'in', [seedIds.isiZuluTool, seedIds.brokenTool])
      .execute();

    await transaction
      .insertInto('steps')
      .values([
        {
          id: seedIds.consentStep,
          tool_id: seedIds.isiZuluTool,
          title: 'Learner consent',
          script: 'May I ask you to read something for me?',
          position: 1,
        },
        {
          id: seedIds.contextStep,
          tool_id: seedIds.isiZuluTool,
          title: 'Learner context survey',
          script: null,
          position: 2,
        },
        {
          id: seedIds.readingStep,
          tool_id: seedIds.isiZuluTool,
          title: 'Oral reading fluency',
          script: 'Read this out loud, as well as you can.',
          position: 3,
        },
        {
          id: seedIds.brokenEmptyStep,
          tool_id: seedIds.brokenTool,
          title: 'Empty step',
          script: null,
          position: 1,
        },
        {
          id: seedIds.brokenReadingStep,
          tool_id: seedIds.brokenTool,
          title: 'Incomplete reading',
          script: null,
          position: 2,
        },
        {
          id: seedIds.brokenChoiceStep,
          tool_id: seedIds.brokenTool,
          title: 'Invalid multiple choice',
          script: null,
          position: 3,
        },
      ])
      .execute();

    await transaction
      .insertInto('tasks')
      .values([
        {
          id: '41111111-1111-4111-8111-111111111111',
          step_id: seedIds.consentStep,
          type: 'survey',
          prompt: 'Did the learner agree?',
          position: 1,
          passage: null,
          word_count: null,
          duration_seconds: null,
          stop_after_errors: null,
          options: null,
        },
        {
          id: '42222222-2222-4222-8222-222222222222',
          step_id: seedIds.contextStep,
          type: 'survey',
          prompt: 'Do you have books at home?',
          position: 1,
          passage: null,
          word_count: null,
          duration_seconds: null,
          stop_after_errors: null,
          options: null,
        },
        {
          id: '43333333-3333-4333-8333-333333333333',
          step_id: seedIds.contextStep,
          type: 'survey',
          prompt: 'Who reads with you?',
          position: 2,
          passage: null,
          word_count: null,
          duration_seconds: null,
          stop_after_errors: null,
          options: null,
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          step_id: seedIds.readingStep,
          type: 'reading',
          prompt: 'Read the passage aloud.',
          position: 1,
          passage: seedIsiZuluPassage,
          word_count: 130,
          duration_seconds: 60,
          stop_after_errors: 5,
          options: null,
        },
        {
          id: '45555555-5555-4555-8555-555555555555',
          step_id: seedIds.brokenReadingStep,
          type: 'reading',
          prompt: 'This reading task is intentionally incomplete.',
          position: 1,
          passage: null,
          word_count: null,
          duration_seconds: null,
          stop_after_errors: null,
          options: null,
        },
        {
          id: '46666666-6666-4666-8666-666666666666',
          step_id: seedIds.brokenChoiceStep,
          type: 'multiple_choice',
          prompt: 'This task intentionally has duplicate options.',
          position: 1,
          passage: null,
          word_count: null,
          duration_seconds: null,
          stop_after_errors: null,
          options: ['Duplicate', 'Duplicate'],
        },
      ])
      .execute();
  });
}
