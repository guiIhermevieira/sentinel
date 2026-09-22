import { Module } from '@nestjs/common';
import { RuleConfigsService } from './rule-configs.service';
import { RuleRegistry } from './rule-registry';

@Module({
  providers: [RuleRegistry, RuleConfigsService],
  exports: [RuleRegistry, RuleConfigsService],
})
export class RulesConfigModule {}
