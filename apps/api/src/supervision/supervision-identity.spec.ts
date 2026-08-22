import { SupervisionService } from './supervision.service'

describe('Supervision safe identities', () => {
  it('projects only public identity fields onto the correct roles', async () => {
    const people = [{ id:'guardian',displayName:'Saleh',username:'saleh',avatarUrl:null },{ id:'supervised',displayName:'Hadeel',username:'hadeel',avatarUrl:'/avatar.png' }]
    const where = jest.fn().mockResolvedValue(people); const from = jest.fn().mockReturnValue({where}); const select = jest.fn().mockReturnValue({from})
    const service = new SupervisionService({db:{select}} as never)
    const result = await (service as any).withIdentities([{id:'rel',guardianUserId:'guardian',supervisedUserId:'supervised'}])
    expect(result[0].guardian).toEqual(people[0]); expect(result[0].supervisedUser).toEqual(people[1])
    for(const identity of [result[0].guardian,result[0].supervisedUser]){expect(identity).not.toHaveProperty('email');expect(identity).not.toHaveProperty('passwordHash');expect(identity).not.toHaveProperty('phone');expect(identity).not.toHaveProperty('refreshToken')}
  })
  it('marks a supervised-side relationship with the supervised current role', async () => {
    const people = [{ id:'guardian',displayName:'Guardian',username:'guardian',avatarUrl:null },{ id:'supervised',displayName:'Supervised',username:'supervised',avatarUrl:null }]
    const where = jest.fn().mockResolvedValue(people); const from = jest.fn().mockReturnValue({where}); const select = jest.fn().mockReturnValue({from})
    const service = new SupervisionService({db:{select}} as never)
    const [result] = await (service as any).withIdentities([{id:'rel',guardianUserId:'guardian',supervisedUserId:'supervised'}], 'supervised')
    expect(result.currentRole).toBe('supervised')
  })
})
