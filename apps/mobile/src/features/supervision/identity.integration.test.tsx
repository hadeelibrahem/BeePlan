import { mobileIdentityLabel } from './identity'
describe('mobile supervision safe identity', () => {
  it('uses display name', () => expect(mobileIdentityLabel({id:'secret-id',displayName:'Saleh',username:'saleh',avatarUrl:null})).toBe('Saleh'))
  it('uses username fallback', () => expect(mobileIdentityLabel({id:'secret-id',displayName:'',username:'saleh',avatarUrl:null})).toBe('@saleh'))
  it('never uses the id fallback', () => expect(mobileIdentityLabel({id:'secret-id',displayName:'',username:null,avatarUrl:null})).toBe('BeePlan user'))
})
