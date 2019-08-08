import { Tree, HostTree } from '@angular-devkit/schematics';
import {
  SchematicTestRunner,
  UnitTestTree,
} from '@angular-devkit/schematics/testing';
import { Schema as AzureOptions } from './schema';
import * as path from 'path';

const collectionPath = path.join(__dirname, '../collection.json');
const APP_MODULE_CONTENT = `
import { Module } from '@nestjs/common';
@Module({
  imports: [],
})
export class AppModule {}
`;
const APP_MODULE_CONTENT_NO_IMPORT = `
import { Module } from '@nestjs/common';
@Module({
  imports: [],
})
export class AppModule {}
`;
const MAIN_FILE = `
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
`;

const azureOptions: AzureOptions = {
  storageAccountName: 'testing',
  storageAccountSAS: 'testing',
};

export function mockProcessStdin() {
  const processStdin = process.stdin.write as any;
  if (processStdin.mockRestore) {
    processStdin.mockRestore();
  }
  let spyImplementation: any;
  spyImplementation = jest
    .spyOn(process.stdin, 'write')
    .mockImplementation(() => true);
  return spyImplementation as jest.SpyInstance<
    (buffer: Buffer | string, encoding?: string, cb?: Function) => boolean
  >;
}

describe('Running nest add @nestjs/azure-storage in a clean project', () => {
  let tree: UnitTestTree;
  let runner: SchematicTestRunner;
  let stdin: any;

  beforeAll(() => {
    stdin = require('mock-stdin').stdin();
  });

  beforeEach(() => {
    tree = new UnitTestTree(new HostTree());
    tree.create('/package.json', JSON.stringify({}));
    tree.create('/src/main.ts', MAIN_FILE);
    tree.create('/src/app.module.ts', APP_MODULE_CONTENT);
    runner = new SchematicTestRunner('schematics', collectionPath);
  });

  it('should validate required argument: storageAccountName', () => {
    const invalidAzureOptions = { ...azureOptions };
    invalidAzureOptions.storageAccountName = null;

    expect(() => {
      runner.runSchematic('nest-add', invalidAzureOptions, tree);
    }).toThrow();
  });

  it('should validate required argument: storageAccountSAS', () => {
    const invalidAzureOptions = { ...azureOptions };
    invalidAzureOptions.storageAccountSAS = null;

    expect(() => {
      runner.runSchematic('nest-add', invalidAzureOptions, tree);
    }).toThrow();
  });

  it('should create all required files', () => {
    runner.runSchematic('nest-add', azureOptions, tree);

    expect(tree.files).toEqual([
      '/package.json',
      '/.env',
      '/.gitignore',
      '/src/main.ts',
      '/src/app.module.ts',
    ]);
    expect(tree.files.length).toEqual(5);
  });

  it('should add all required dependencies to package.json', () => {
    runner.runSchematic('nest-add', azureOptions, tree);

    const fileContent = JSON.parse(tree.readContent('/package.json'));
    expect(fileContent.dependencies).toBeTruthy();
    expect(fileContent.dependencies['@azure/ms-rest-js']).toBeTruthy();
    expect(fileContent.dependencies['@azure/storage-blob']).toBeTruthy();
    expect(fileContent.dependencies['dotenv']).toBeTruthy();
  });

  it('should add the .env file to .gitignore', () => {
    runner.runSchematic('nest-add', azureOptions, tree);

    const fileContent = tree.readContent('/.gitignore');
    expect(fileContent).toContain('\n.env\n\n.env.*\n');
  });

  it('should add AZURE_STORAGE_SAS_KEY and AZURE_STORAGE_ACCOUNT config to .env', () => {
    runner.runSchematic('nest-add', azureOptions, tree);

    const fileContent = tree.readContent('/.env');
    expect(fileContent).toContain('AZURE_STORAGE_SAS_KEY=testing');
    expect(fileContent).toContain('AZURE_STORAGE_ACCOUNT=testing');
  });

  it(`should add the require('dotenv') call in src/main.ts`, () => {
    runner.runSchematic('nest-add', azureOptions, tree);

    const fileContent = tree.readContent('/src/main.ts');
    expect(fileContent).toContain(
      `if (process.env.NODE_ENV !== 'production') require('dotenv').config();`,
    );
  });

  it(`should add the @nestjs/azure-storage import in src/app.module.ts`, () => {
    runner.runSchematic('nest-add', azureOptions, tree);

    const fileContent = tree.readContent('/src/app.module.ts');
    expect(fileContent).toContain(
      `import { AzureStorageModule } from '@nestjs/azure-storage';`,
    );
  });

  describe(`should add the AzureStorageModule.withConfig(...) call in src/app.module.ts`, () => {
    it(`when "Module.import" is empty array`, () => {
      runner.runSchematic('nest-add', azureOptions, tree);
      const fileContent = tree.readContent('/src/app.module.ts');
      expect(fileContent).toContain(
        `AzureStorageModule.withConfig({sasKey: process.env['AZURE_STORAGE_SAS_KEY'], accountName: process.env['AZURE_STORAGE_ACCOUNT'], containerName: 'nest-demo-container' }`,
      );
    });

    it('when "Module.import" is undefined', () => {
      runner.runSchematic('nest-add', azureOptions, tree);
      const fileContent = tree.readContent('/src/app.module.ts');
      expect(fileContent).toContain(
        `AzureStorageModule.withConfig({sasKey: process.env['AZURE_STORAGE_SAS_KEY'], accountName: process.env['AZURE_STORAGE_ACCOUNT'], containerName: 'nest-demo-container' }`,
      );
    });
  });
});

describe('Running nest add @nestjs/azure-storage in a complex project', () => {
  let tree: UnitTestTree;
  let runner: SchematicTestRunner;

  beforeEach(() => {
    tree = new UnitTestTree(new HostTree());
    runner = new SchematicTestRunner('schematics', collectionPath);
  });

  it('should throw if missing package.json', () => {
    expect(() => {
      runner.runSchematic('nest-add', azureOptions, tree);
    }).toThrow('Could not read package.json.');
  });

  it('should throw if missing src/main.ts', () => {
    tree.create('/package.json', JSON.stringify({}));

    expect(() => {
      runner.runSchematic('nest-add', azureOptions, tree);
    }).toThrow(
      'Could not locate "src/main.ts". Make sure to provide the correct --mainFileName argument.',
    );
  });

  it('should throw if missing src/app.module.ts', () => {
    tree.create('/package.json', JSON.stringify({}));
    tree.create('/src/main.ts', MAIN_FILE);

    expect(() => {
      runner.runSchematic('nest-add', azureOptions, tree);
    }).toThrow('Could not read Nest module file: src/app.module.ts');
  });

  it('should skipp if .env already present', () => {
    tree.create('/package.json', JSON.stringify({}));
    tree.create('/src/main.ts', MAIN_FILE);
    tree.create('/src/app.module.ts', APP_MODULE_CONTENT);
    tree.create('/.env', 'old content');

    runner.runSchematic('nest-add', azureOptions, tree);
    const fileContent = tree.readContent('/.env');
    expect(fileContent).toContain('AZURE_STORAGE_SAS_KEY=testing');
    expect(fileContent).toContain('AZURE_STORAGE_ACCOUNT=testing');
  });

  it('should skipp if .env already contains the same configuration', () => {
    tree.create('/package.json', JSON.stringify({}));
    tree.create('/src/main.ts', MAIN_FILE);
    tree.create('/src/app.module.ts', APP_MODULE_CONTENT);
    const ENV_CONTENT = [
      '# See: http://bit.ly/azure-storage-account',
      'AZURE_STORAGE_SAS_KEY=testing',
      '# See: http://bit.ly/azure-storage-sas-key',
      'AZURE_STORAGE_ACCOUNT=testing',
    ].join('\n');
    tree.create('/.env', ENV_CONTENT);

    runner.runSchematic('nest-add', azureOptions, tree);
    const fileContent = tree.readContent('/.env');
    expect(fileContent).toMatch(ENV_CONTENT);
  });
});
